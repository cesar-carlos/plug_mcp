import { DomainError, ERROR_SOURCE } from "../../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../../domain/errors/error-codes.js";
import type { Dialeto } from "../../../domain/entities/dialeto.js";
import type { ParametroSkill } from "../../../domain/entities/skill.js";
import { tryParseSelect, walkSelectTree, type SqlAstSelect } from "./sql-ast.js";
import {
  extractNamedParams,
  rewriteAtParamsToColon,
  sqlDeclaraLimiteExterno,
  sqlTemOrderByExterno,
  stripOrderByExterno,
} from "./sql-scan.js";

export {
  extractNamedParams,
  rewriteAtParamsToColon,
  sqlDeclaraLimiteExterno as sqlDeclaraLimiteDeLinhas,
  sqlTemOrderByExterno as sqlTemOrderBy,
};

/** Teto de itens expandido em `IN (:lista)` antes do RPC (ODBC/hub). Não interpolar literais. */
export const IN_LISTA_MAX_ITENS = 64;

export const SQL_MAX_BYTES = 1_048_576;

export interface TabelaSql {
  readonly nome: string;
  readonly alias: string | null;
}

export interface ColunaSql {
  readonly expr: string;
  readonly alias: string;
}

export interface RelacionamentoSql {
  readonly tipoJoin: string;
  readonly tabela: string;
  readonly on: string | null;
}

export interface JoinEquality {
  readonly leftAlias: string;
  readonly leftColumn: string;
  readonly rightAlias: string;
  readonly rightColumn: string;
}

export interface SqlModelo {
  readonly sql: string;
  readonly tabelas: readonly TabelaSql[];
  readonly colunas: readonly ColunaSql[];
  readonly relacionamentos: readonly RelacionamentoSql[];
}

const stripComments = (sql: string): string =>
  sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const unquote = (ident: string): string => ident.replace(/[[\]"`']/g, "");

export const lastIdent = (qualified: string): string => {
  const parts = unquote(qualified).split(".");
  return parts[parts.length - 1] ?? qualified;
};

export const assertSqlTamanho = (sql: string): void => {
  const bytes = Buffer.byteLength(sql, "utf8");
  if (bytes > SQL_MAX_BYTES) {
    throw DomainError.pacote({
      code: ERROR_CODES.VALIDATION_ERROR,
      message: "SQL excede 1 MiB.",
      hint: "Reduza o SQL. O hub recusa comandos maiores que ~1 MiB.",
    });
  }
};

export const parseSqlModelo = (raw: string, dialeto?: Dialeto): SqlModelo => {
  const sql = stripComments(raw);
  if (!sql) {
    throw DomainError.pacote({
      code: ERROR_CODES.VALIDATION_ERROR,
      message: "sql é obrigatório.",
      hint: "Envie um SELECT com colunas nomeadas. Não use SELECT *.",
    });
  }
  assertSqlTamanho(sql);
  if (!/^(with\b[\s\S]+\)\s*)?select\b/i.test(sql)) {
    throw DomainError.pacote({
      code: ERROR_CODES.INVALID_SQL,
      message: "Só SELECT pode treinar o grafo.",
      hint: "Envie um SELECT (CTE WITH ... SELECT também vale). INSERT/UPDATE/DELETE/DDL não são aceitos no treino.",
    });
  }
  if (/\b(insert|update|delete|merge|drop|alter|create|truncate|grant|revoke)\b/i.test(sql)) {
    throw DomainError.pacote({
      code: ERROR_CODES.INVALID_SQL,
      message: "SQL de treino não pode mutar dados.",
      hint: "Use apenas SELECT. Mutações ficam a cargo do client_token em consultar_dados, não no treino.",
    });
  }
  const withoutTrailingSemi = sql.replace(/;+\s*$/, "");
  if (withoutTrailingSemi.includes(";")) {
    throw DomainError.pacote({
      code: ERROR_CODES.INVALID_SQL,
      message: "SQL não pode conter um segundo comando.",
      hint: "Envie um único SELECT, sem ponto-e-vírgula no meio.",
    });
  }
  if (dialeto === "firebird" && sqlDeclaraLimiteExterno(withoutTrailingSemi)) {
    throw DomainError.pacote({
      code: ERROR_CODES.INVALID_SQL,
      message: "sqlModelo Firebird não pode declarar FIRST/TOP/LIMIT.",
      hint: "Não coloque FIRST/TOP/LIMIT no sqlModelo. A amostra FIRST é wrap do servidor. Depois de publicar, consultar_dados e inspecionar_consulta só rodam a consulta exemplo (sem sql). Treino não é DIALECT_UNSUPPORTED.",
    });
  }
  const ast = tryParseSelect(sql, dialeto);
  if (!ast) {
    throw DomainError.pacote({
      code: ERROR_CODES.INVALID_SQL,
      message: "Não foi possível interpretar o SQL neste dialeto.",
      hint:
        dialeto === "firebird"
          ? "Ajuste o SELECT sem FIRST/CONTAINING no sqlModelo. A amostra FIRST é wrap do servidor. Treino não é DIALECT_UNSUPPORTED; SQL livre depois de publicar continua só consulta exemplo."
          : "SQL que o parser não entende não vira skill. Ajuste ao guia de dialeto do acesso (mssql/sybase/postgres/firebird).",
    });
  }
  return sqlModeloFromAst(sql, ast);
};

/** Aviso de treino: sqlModelo com TOP/LIMIT/FIRST recusa options.page (dois padrões). */
export const avisoLimiteNoSqlModelo = (sql: string): { code: string; message: string } | null => {
  if (!sqlDeclaraLimiteExterno(sql)) {
    return null;
  }
  return {
    code: "PAGINACAO_MODELO",
    message:
      "sqlModelo declara TOP/LIMIT/FIRST; options.page + page_size serão recusados (dois padrões de corte). Consulta única limitada: corte no SQL sem page; páginas: só ORDER BY + options.page.",
  };
};

const sqlModeloFromAst = (sql: string, ast: SqlAstSelect): SqlModelo => {
  if (ast.temStar) {
    throw DomainError.pacote({
      code: ERROR_CODES.INVALID_SQL,
      message: "SELECT * não treina o grafo.",
      hint: "Nomeie as colunas (ex.: SELECT p.codprod, p.descricao FROM produto p).",
    });
  }
  const tabelas: TabelaSql[] = [];
  walkSelectTree(ast, (item) => {
    for (const tabela of item.tabelas) {
      if (!tabela.isSubquery && !tabela.isCte) {
        tabelas.push({ nome: tabela.nome, alias: tabela.alias });
      }
    }
    const fisicas = item.tabelas.filter((tabela) => !tabela.isCte && !tabela.isSubquery);
    if (fisicas.length > 1 && item.joins.length === 0) {
      throw DomainError.pacote({
        code: ERROR_CODES.INVALID_SQL,
        message: "Várias tabelas exigem JOIN explícito.",
        hint: "Não use FROM a, b. Declare JOIN ... ON para o grafo registrar o relacionamento.",
      });
    }
    for (const join of item.joins) {
      if (join.tipoJoin.includes("cross")) {
        continue;
      }
      if (join.equalities.length === 0) {
        throw DomainError.pacote({
          code: ERROR_CODES.INVALID_SQL,
          message: "JOIN exige ON com igualdade alias.coluna = alias.coluna.",
          hint: "Ex.: INNER JOIN cliente c ON c.codcli = p.codcli. CROSS JOIN não grava relacionamento. Funções no ON não são aceitas.",
        });
      }
    }
  });
  if (tabelas.length === 0) {
    throw DomainError.pacote({
      code: ERROR_CODES.INVALID_SQL,
      message: "SQL de treino precisa de FROM com tabela real.",
      hint: "O agente classifica autorização por tabela. Referencie tabelas/views existentes.",
    });
  }
  const relacionamentos: RelacionamentoSql[] = [];
  walkSelectTree(ast, (item) => {
    for (const join of item.joins) {
      const destino = item.tabelas.find(
        (tabela) =>
          (tabela.alias !== null && tabela.alias === join.alias) || tabela.nome === join.tabela,
      );
      if (destino?.isSubquery || destino?.isCte) {
        continue;
      }
      relacionamentos.push({
        tipoJoin: join.tipoJoin,
        tabela: join.tabela,
        on:
          join.equalities.length > 0
            ? join.equalities
                .map(
                  (eq) => `${eq.leftAlias}.${eq.leftColumn} = ${eq.rightAlias}.${eq.rightColumn}`,
                )
                .join(" AND ")
            : join.on,
      });
    }
  });
  const colunas: ColunaSql[] = ast.colunas.map((coluna) => {
    if (coluna.isExpression && !coluna.alias) {
      throw DomainError.pacote({
        code: ERROR_CODES.INVALID_SQL,
        message: "Expressão no SELECT precisa de alias explícito.",
        hint: "Use AS (ex.: SUM(qtd) AS total). Sem alias o grafo gravaria um nome inválido.",
      });
    }
    return {
      expr:
        coluna.table && coluna.column
          ? `${coluna.table}.${coluna.column}`
          : (coluna.expr ?? coluna.column ?? coluna.alias),
      alias: coluna.alias ?? coluna.column ?? lastIdent(coluna.expr),
    };
  });
  if (colunas.length === 0) {
    throw DomainError.pacote({
      code: ERROR_CODES.INVALID_SQL,
      message: "Não foi possível ler as colunas do SELECT.",
      hint: "Use colunas simples ou alias (ex.: SUM(qtd) AS total).",
    });
  }
  if (ast.joins.length > 0) {
    for (const coluna of ast.colunas) {
      if (!coluna.isExpression && !coluna.table) {
        throw DomainError.pacote({
          code: ERROR_CODES.INVALID_SQL,
          message: "Coluna sem qualificador em JOIN.",
          hint: "Com JOIN, qualifique cada coluna (ex.: p.codprod em vez de codprod). Expressões com AS continuam válidas.",
        });
      }
    }
  }
  return { sql, tabelas: dedupeTabelas(tabelas), colunas, relacionamentos };
};

/** Igualdades `alias.coluna = alias.coluna` extraídas de um ON (AND/OR no meio são ignorados). */
export const parseJoinEqualities = (on: string | null | undefined): readonly JoinEquality[] => {
  if (!on) {
    return [];
  }
  const re =
    /([A-Za-z_][A-Za-z0-9_$#]*)\.([A-Za-z_][A-Za-z0-9_$#]*)\s*=\s*([A-Za-z_][A-Za-z0-9_$#]*)\.([A-Za-z_][A-Za-z0-9_$#]*)/g;
  const out: JoinEquality[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(on)) !== null) {
    const leftAlias = match[1];
    const leftColumn = match[2];
    const rightAlias = match[3];
    const rightColumn = match[4];
    if (leftAlias && leftColumn && rightAlias && rightColumn) {
      out.push({ leftAlias, leftColumn, rightAlias, rightColumn });
    }
  }
  return out;
};

/** Qualificador de `alias.coluna`; expressões compostas devolvem null. */
export const columnQualifier = (expr: string): string | null => {
  const match = /^([A-Za-z_][A-Za-z0-9_$#]*)\.([A-Za-z_][A-Za-z0-9_$#]*)$/.exec(expr.trim());
  return match?.[1] ?? null;
};

const dedupeTabelas = (tabelas: TabelaSql[]): TabelaSql[] => {
  const seen = new Set<string>();
  const out: TabelaSql[] = [];
  for (const tabela of tabelas) {
    const key = tabela.nome.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(tabela);
  }
  return out;
};

export const sqlAmostra = (dialeto: Dialeto, sql: string): string => {
  const inner = sql.trim().replace(/;+\s*$/, "");
  switch (dialeto) {
    case "mssql":
    case "sybase":
      return `SELECT TOP 1 * FROM (${inner}) AS _amostra`;
    case "postgres":
      return `SELECT * FROM (${inner}) AS _amostra LIMIT 1`;
    case "firebird":
      return `SELECT FIRST 1 * FROM (${inner}) AS _amostra`;
  }
};

export const sqlParaOdbc = (sql: string): string =>
  rewriteAtParamsToColon(sql, extractNamedParams(sql));

export const bindNamedParams = (
  sql: string,
  provided: Record<string, unknown> | undefined,
  contract: readonly ParametroSkill[] = [],
): Record<string, unknown> => {
  const names = extractNamedParams(sql);
  const source = provided ?? {};
  const byName = new Map(contract.map((param) => [param.nome, param]));
  const bound: Record<string, unknown> = {};
  const missing: string[] = [];
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(source, name)) {
      bound[name] = source[name];
      continue;
    }
    const param = byName.get(name);
    if (param?.obrigatorio === false) {
      bound[name] = null;
      continue;
    }
    missing.push(name);
  }
  if (missing.length > 0) {
    throw new DomainError({
      code: ERROR_CODES.VALIDATION_ERROR,
      message: `Params ausentes: ${missing.join(", ")}.`,
      hint: "Passe params nomeados iguais aos placeholders :nome do SQL. Opcionais (obrigatorio=false) viram null. Listas/IN exigem um placeholder por valor.",
    });
  }
  return bound;
};

export const expandirInListas = (
  sql: string,
  params: Record<string, unknown>,
): { sql: string; params: Record<string, unknown> } => {
  let nextSql = sql;
  const nextParams: Record<string, unknown> = { ...params };
  for (const [nome, value] of Object.entries(params)) {
    if (!Array.isArray(value)) {
      continue;
    }
    const escaped = nome.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const hasIn = new RegExp(`IN\\s*\\(\\s*:${escaped}\\s*\\)`, "i").test(sql);
    if (!hasIn) {
      continue;
    }
    if (value.length === 0) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: `Lista IN :${nome} está vazia.`,
        hint: "Envie pelo menos um valor, ou um placeholder por item (IN (:a, :b)).",
      });
    }
    if (value.length > IN_LISTA_MAX_ITENS) {
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: `Lista IN :${nome} tem ${String(value.length)} valores; o teto é ${String(IN_LISTA_MAX_ITENS)}.`,
        hint: "Recorte a lista (vários consultar_dados) ou use um recorte no banco. Não interpole literais no SQL (LITERAL_TEXTO). Não reescreva o JOIN.",
        source: ERROR_SOURCE.mcp,
        stage: "in_lista",
        nextAction: "reduzir_lista_in",
      });
    }
    const placeholders = value.map((_, index) => {
      const key = `${nome}_${String(index)}`;
      nextParams[key] = value[index];
      return `:${key}`;
    });
    delete nextParams[nome];
    nextSql = nextSql.replace(
      new RegExp(`IN\\s*\\(\\s*:${escaped}\\s*\\)`, "gi"),
      `IN (${placeholders.join(", ")})`,
    );
  }
  return { sql: nextSql, params: nextParams };
};

/** Bind tolerante: placeholder ausente vira `null` (treino/validação de schema, não consulta). */
export const bindParamsForValidation = (
  sql: string,
  provided: Record<string, unknown> | undefined,
): Record<string, unknown> => {
  const names = extractNamedParams(sql);
  const source = provided ?? {};
  const bound: Record<string, unknown> = {};
  for (const name of names) {
    bound[name] = Object.prototype.hasOwnProperty.call(source, name) ? source[name] : null;
  }
  return bound;
};

const ISO_DATE =
  /^\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?$/;

const coerceParamValue = (nome: string, tipo: ParametroSkill["tipo"], value: unknown): unknown => {
  if (value == null) {
    return value;
  }
  switch (tipo) {
    case "number": {
      if (typeof value === "number" && Number.isFinite(value)) {
        return value;
      }
      if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
        return Number(value);
      }
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: `Param ${nome} deve ser number.`,
        hint: 'Passe um número (ex.: 10 ou "10").',
      });
    }
    case "boolean": {
      if (typeof value === "boolean") {
        return value;
      }
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: `Param ${nome} deve ser boolean.`,
        hint: "Passe true ou false.",
      });
    }
    case "integer": {
      if (typeof value === "number" && Number.isInteger(value)) {
        return value;
      }
      if (typeof value === "string" && /^-?\d+$/.test(value.trim())) {
        return Number(value.trim());
      }
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: `Param ${nome} deve ser integer.`,
        hint: "Passe um inteiro (ex.: 10).",
      });
    }
    case "decimal": {
      if (typeof value === "number" && Number.isFinite(value)) {
        return String(value);
      }
      if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
        return value.trim();
      }
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: `Param ${nome} deve ser decimal (string segura).`,
        hint: 'Passe "10.50" como texto para não perder precisão.',
      });
    }
    case "datetime":
    case "date": {
      if (typeof value === "string" && ISO_DATE.test(value.trim())) {
        return value.trim();
      }
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: `Param ${nome} deve ser data ISO (YYYY-MM-DD).`,
        hint: "Ex.: 2026-08-01 ou 2026-08-01T00:00:00Z.",
      });
    }
    default: {
      if (typeof value === "string") {
        return value;
      }
      if (typeof value === "number" || typeof value === "boolean") {
        return String(value);
      }
      throw new DomainError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: `Param ${nome} deve ser string.`,
        hint: "Passe um texto.",
      });
    }
  }
};

export const coerceBoundParams = (
  bound: Record<string, unknown>,
  contract: readonly ParametroSkill[],
): Record<string, unknown> => {
  if (contract.length === 0) {
    return bound;
  }
  const out: Record<string, unknown> = { ...bound };
  for (const param of contract) {
    if (!Object.prototype.hasOwnProperty.call(out, param.nome)) {
      continue;
    }
    out[param.nome] = coerceParamValue(param.nome, param.tipo, out[param.nome]);
  }
  return out;
};

export const sqlValidacaoVazia = (dialeto: Dialeto, sql: string): string => {
  const inner = stripOrderByExterno(sql.trim().replace(/;+\s*$/, ""));
  const wrapped = `SELECT * FROM (${inner}) AS _validacao`;
  switch (dialeto) {
    case "mssql":
    case "sybase":
      return `${wrapped} WHERE 1 = 0`;
    case "postgres":
      return `${wrapped} WHERE FALSE`;
    case "firebird":
      return `${wrapped} WHERE 1 = 0`;
  }
};
