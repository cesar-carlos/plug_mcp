import { DomainError } from "../../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../../domain/errors/error-codes.js";
import type { Dialeto } from "../../../domain/entities/dialeto.js";

export const SQL_MAX_BYTES = 1_048_576;
const IDENT = "[A-Za-z_][A-Za-z0-9_$#]*";

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

const lastIdent = (qualified: string): string => {
  const parts = unquote(qualified).split(".");
  return parts[parts.length - 1] ?? qualified;
};

export const assertSqlTamanho = (sql: string): void => {
  const bytes = Buffer.byteLength(sql, "utf8");
  if (bytes > SQL_MAX_BYTES) {
    throw new DomainError({
      code: ERROR_CODES.VALIDATION_ERROR,
      message: "SQL excede 1 MiB.",
      hint: "Reduza o SQL. O hub recusa comandos maiores que ~1 MiB.",
    });
  }
};

export const parseSqlModelo = (raw: string): SqlModelo => {
  const sql = stripComments(raw);
  if (!sql) {
    throw new DomainError({
      code: ERROR_CODES.VALIDATION_ERROR,
      message: "sql é obrigatório.",
      hint: "Envie um SELECT com colunas nomeadas. Não use SELECT *.",
    });
  }
  assertSqlTamanho(sql);
  if (!/^(with\b[\s\S]+\)\s*)?select\b/i.test(sql)) {
    throw new DomainError({
      code: ERROR_CODES.INVALID_SQL,
      message: "Só SELECT pode treinar o grafo.",
      hint: "Envie um SELECT (CTE WITH ... SELECT também vale). INSERT/UPDATE/DELETE/DDL não são aceitos no treino.",
    });
  }
  if (/\b(insert|update|delete|merge|drop|alter|create|truncate|grant|revoke)\b/i.test(sql)) {
    throw new DomainError({
      code: ERROR_CODES.INVALID_SQL,
      message: "SQL de treino não pode mutar dados.",
      hint: "Use apenas SELECT. Mutações ficam a cargo do client_token em consultar_dados, não no treino.",
    });
  }
  if (/select\s+(?:distinct\s+)?\*/i.test(sql) || /select\s+[\s\S]*\b\w+\.\*/i.test(sql)) {
    throw new DomainError({
      code: ERROR_CODES.INVALID_SQL,
      message: "SELECT * não treina o grafo.",
      hint: "Nomeie as colunas (ex.: SELECT p.codprod, p.descricao FROM produto p).",
    });
  }

  const fromMatch =
    /\bfrom\b\s+((?:[\w.[\]"`']+\s*(?:as\s+)?[\w"`']*\s*,\s*)*[\w.[\]"`']+(?:\s+(?:as\s+)?[\w"`']+)?)/i.exec(
      sql,
    );
  if (!fromMatch?.[1]) {
    throw new DomainError({
      code: ERROR_CODES.INVALID_SQL,
      message: "SQL de treino precisa de FROM com tabela real.",
      hint: "O agente classifica autorização por tabela. Referencie tabelas/views existentes.",
    });
  }

  const tabelas: TabelaSql[] = [];
  const fromChunk = fromMatch[1].replace(
    /\b(inner|left|right|full|cross|join|where|group|order|having|union|except|intersect|limit|offset|fetch|rows)\b[\s\S]*$/i,
    "",
  );
  for (const part of fromChunk.split(",")) {
    const parsed = parseTabelaRef(part.trim());
    if (parsed) {
      tabelas.push(parsed);
    }
  }

  const relacionamentos: RelacionamentoSql[] = [];
  const joinRe =
    /\b((?:inner|left(?:\s+outer)?|right(?:\s+outer)?|full(?:\s+outer)?|cross)\s+)?join\s+([\w.[\]"`']+)(?:\s+(?:as\s+)?(\w+))?(?:\s+on\s+([^]+?))?(?=\s+(?:inner|left|right|full|cross)?\s*join\b|\s+where\b|\s+group\b|\s+order\b|\s+having\b|\s+union\b|$)/gi;
  let joinMatch: RegExpExecArray | null;
  while ((joinMatch = joinRe.exec(sql)) !== null) {
    const tabela = lastIdent(joinMatch[2] ?? "");
    tabelas.push({ nome: tabela, alias: joinMatch[3] ?? null });
    relacionamentos.push({
      tipoJoin: (joinMatch[1]?.trim() ? joinMatch[1].trim() : "inner").toLowerCase(),
      tabela,
      on: joinMatch[4]?.trim() ?? null,
    });
  }

  if (tabelas.length > 1 && relacionamentos.length === 0) {
    throw new DomainError({
      code: ERROR_CODES.INVALID_SQL,
      message: "Várias tabelas exigem JOIN explícito.",
      hint: "Não use FROM a, b. Declare JOIN ... ON para o grafo registrar o relacionamento.",
    });
  }

  const selectList = extractSelectList(sql);
  const colunas = selectList.map(parseSelectItem).filter((c): c is ColunaSql => c !== null);
  if (colunas.length === 0) {
    throw new DomainError({
      code: ERROR_CODES.INVALID_SQL,
      message: "Não foi possível ler as colunas do SELECT.",
      hint: "Use colunas simples ou alias (ex.: SUM(qtd) AS total).",
    });
  }

  return { sql, tabelas: dedupeTabelas(tabelas), colunas, relacionamentos };
};

const parseTabelaRef = (raw: string): TabelaSql | null => {
  const match = new RegExp(`^(${IDENT}(?:\\.${IDENT})?)(?:\\s+(?:as\\s+)?(${IDENT}))?$`, "i").exec(
    unquote(raw).trim(),
  );
  if (!match?.[1]) {
    return null;
  }
  return { nome: lastIdent(match[1]), alias: match[2] ?? null };
};

const extractSelectList = (sql: string): string[] => {
  const match = /\bselect\b\s+(?:distinct\s+)?([\s\S]+?)\s+\bfrom\b/i.exec(sql);
  const list = match?.[1] ?? "";
  const items: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of list) {
    if (ch === "(") {
      depth += 1;
    }
    if (ch === ")") {
      depth -= 1;
    }
    if (ch === "," && depth === 0) {
      items.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) {
    items.push(current.trim());
  }
  return items;
};

const parseSelectItem = (item: string): ColunaSql | null => {
  if (!item || item === "*") {
    return null;
  }
  const asMatch = /^([\s\S]+?)\s+as\s+("?[\w$#]+"?)$/i.exec(item);
  if (asMatch?.[1] && asMatch[2]) {
    return { expr: asMatch[1].trim(), alias: unquote(asMatch[2]) };
  }
  const trailing = /^([\s\S]+?)\s+("?[\w$#]+"?)$/.exec(item);
  if (trailing?.[1] && trailing[2] && !/[\s(]/.test(unquote(trailing[2]))) {
    const maybeAlias = unquote(trailing[2]);
    if (!/^(from|where|group|order)$/i.test(maybeAlias)) {
      return { expr: trailing[1].trim(), alias: maybeAlias };
    }
  }
  return { expr: item, alias: lastIdent(item) };
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

export const sqlValidacaoVazia = (dialeto: Dialeto, sql: string): string => {
  const inner = sql.trim().replace(/;+\s*$/, "");
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
