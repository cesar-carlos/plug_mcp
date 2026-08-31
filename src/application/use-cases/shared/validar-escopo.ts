import type { EscopoSkill } from "../../../domain/entities/escopo.js";
import { paresDoRelacionamento } from "../../../domain/entities/escopo.js";
import {
  igualdadesCobremRelacionamento,
  type IgualdadeResolvida,
} from "../../../domain/entities/relacionamento.js";
import { DomainError } from "../../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../../domain/errors/error-codes.js";
import type { Dialeto } from "../../../domain/entities/dialeto.js";
import {
  collectColumnRefsLocal,
  parseSelect,
  temLimiteNoSelectExterno,
  temOrderByNoSelectExterno,
  type SqlAstSelect,
} from "./sql-ast.js";
import { hintComProximos } from "./sugestoes.js";
import { sqlDeclaraLimiteExterno, sqlTemOrderByExterno } from "./sql-scan.js";

export const GROUP_BY_MAX_EXPRESSIONS = 16;

const lower = (value: string): string => value.trim().toLowerCase();

const tabelaNoEscopo = (escopo: EscopoSkill, nome: string): boolean =>
  escopo.tabelas.some((tabela) => lower(tabela) === lower(nome));

const colunasDaTabela = (escopo: EscopoSkill, nome: string): readonly string[] => {
  const entry = Object.entries(escopo.colunasPorTabela).find(
    ([tabela]) => lower(tabela) === lower(nome),
  );
  return entry?.[1] ?? [];
};

const colunaNoEscopo = (escopo: EscopoSkill, tabela: string, coluna: string): boolean =>
  colunasDaTabela(escopo, tabela).some((item) => lower(item) === lower(coluna));

const tabelasFisicas = (ast: SqlAstSelect): SqlAstSelect["tabelas"] =>
  ast.tabelas.filter((tabela) => !tabela.isCte && !tabela.isSubquery);

const aliasConhecido = (
  ast: SqlAstSelect,
  cteNomes: ReadonlySet<string>,
  aliasOrName: string,
): boolean => {
  const wanted = lower(aliasOrName);
  if (cteNomes.has(wanted)) {
    return true;
  }
  return ast.tabelas.some(
    (tabela) =>
      lower(tabela.nome) === wanted || (tabela.alias !== null && lower(tabela.alias) === wanted),
  );
};

const resolveTabela = (
  ast: SqlAstSelect,
  cteNomes: ReadonlySet<string>,
  aliasOrName: string | null,
): { nome: string; skipEscopo: boolean } | null => {
  if (!aliasOrName) {
    const fisicas = tabelasFisicas(ast);
    if (fisicas.length === 1 && fisicas[0]) {
      return { nome: fisicas[0].nome, skipEscopo: fisicas[0].isCte || fisicas[0].isSubquery };
    }
    return null;
  }
  const wanted = lower(aliasOrName);
  if (cteNomes.has(wanted)) {
    return { nome: aliasOrName, skipEscopo: true };
  }
  const byAlias = ast.tabelas.find(
    (tabela) =>
      (tabela.alias !== null && lower(tabela.alias) === wanted) || lower(tabela.nome) === wanted,
  );
  if (byAlias) {
    return { nome: byAlias.nome, skipEscopo: byAlias.isCte || byAlias.isSubquery };
  }
  return null;
};

const joinParConhecido = (
  escopo: EscopoSkill,
  leftTable: string,
  leftCol: string,
  rightTable: string,
  rightCol: string,
): boolean =>
  escopo.relacionamentos.some((rel) => {
    const pares = paresDoRelacionamento(rel);
    const a =
      lower(rel.tabelaOrigem) === lower(leftTable) &&
      lower(rel.tabelaDestino) === lower(rightTable) &&
      pares.some(
        (par) =>
          lower(par.colunaOrigem) === lower(leftCol) &&
          lower(par.colunaDestino) === lower(rightCol),
      );
    const b =
      lower(rel.tabelaOrigem) === lower(rightTable) &&
      lower(rel.tabelaDestino) === lower(leftTable) &&
      pares.some(
        (par) =>
          lower(par.colunaOrigem) === lower(rightCol) &&
          lower(par.colunaDestino) === lower(leftCol),
      );
    return a || b;
  });

const tabelasDoJoin = (eqs: readonly IgualdadeResolvida[]): Set<string> => {
  const names = new Set<string>();
  for (const eq of eqs) {
    names.add(lower(eq.leftTable));
    names.add(lower(eq.rightTable));
  }
  return names;
};

const temRelacionamentoCompostoNoPar = (
  escopo: EscopoSkill,
  tabelas: ReadonlySet<string>,
): boolean =>
  escopo.relacionamentos.some((rel) => {
    const pares = paresDoRelacionamento(rel);
    if (pares.length <= 1) {
      return false;
    }
    return tabelas.has(lower(rel.tabelaOrigem)) && tabelas.has(lower(rel.tabelaDestino));
  });

const joinConjuntoConhecido = (
  escopo: EscopoSkill,
  eqs: readonly IgualdadeResolvida[],
): boolean => {
  if (eqs.length === 0) {
    return false;
  }
  const composto = escopo.relacionamentos.some((rel) =>
    igualdadesCobremRelacionamento(eqs, {
      tabelaOrigem: rel.tabelaOrigem,
      tabelaDestino: rel.tabelaDestino,
      pares: paresDoRelacionamento(rel),
    }),
  );
  if (composto) {
    return true;
  }
  if (temRelacionamentoCompostoNoPar(escopo, tabelasDoJoin(eqs))) {
    return false;
  }
  return eqs.every((eq) =>
    joinParConhecido(escopo, eq.leftTable, eq.leftColumn, eq.rightTable, eq.rightColumn),
  );
};

export type ModoValidacaoEscopo = "consulta" | "inspecao";

const starSimplesInspecao = (ast: SqlAstSelect, permitirStarSimples: boolean): boolean => {
  if (!permitirStarSimples || !ast.temStar) {
    return false;
  }
  const nestedStar =
    ast.subqueries.some((sub) => sub.temStar) || ast.setBranches.some((sub) => sub.temStar);
  const fisicas = tabelasFisicas(ast);
  return !nestedStar && fisicas.length === 1 && ast.joins.length === 0;
};

const validarSelect = (
  ast: SqlAstSelect,
  escopo: EscopoSkill,
  cteNomes: ReadonlySet<string>,
  permitirStarSimples = false,
): void => {
  if (ast.temStar && !starSimplesInspecao(ast, permitirStarSimples)) {
    throw new DomainError({
      code: ERROR_CODES.INVALID_SQL,
      message: permitirStarSimples
        ? "SELECT * com JOIN, subquery ou mais de uma tabela não é permitido na inspeção."
        : "SELECT * não é permitido.",
      hint: permitirStarSimples
        ? "Inspecione uma tabela por vez (SELECT * sem JOIN). JOIN só com colunas nomeadas e relacionamento no pacote."
        : "Nomeie as colunas do dataset publicado.",
    });
  }
  if (ast.groupByCount > GROUP_BY_MAX_EXPRESSIONS) {
    throw new DomainError({
      code: ERROR_CODES.VALIDATION_ERROR,
      message: `GROUP BY excede o teto de ${String(GROUP_BY_MAX_EXPRESSIONS)} expressões.`,
      hint: "Agregue menos dimensões ou quebre a consulta. Não use GROUP BY como listagem.",
    });
  }
  for (const tabela of ast.tabelas) {
    if (tabela.isCte || tabela.isSubquery || cteNomes.has(lower(tabela.nome))) {
      continue;
    }
    if (!tabelaNoEscopo(escopo, tabela.nome)) {
      throw new DomainError({
        code: ERROR_CODES.TABELA_FORA_DO_ESCOPO,
        message: `Tabela ${tabela.nome} está fora do escopo das skills publicadas.`,
        hint: hintComProximos(
          "Use só tabelas do pacote da skill. Expanda o escopo com expandir_escopo se o usuário confirmar.",
          tabela.nome,
          escopo.tabelas,
        ),
        source: "sql",
        stage: "validar_escopo",
      });
    }
  }
  const fisicas = tabelasFisicas(ast);
  for (const ref of collectColumnRefsLocal(ast)) {
    if (ref.column === "*") {
      continue;
    }
    if (!ref.table) {
      if (fisicas.length > 1) {
        throw new DomainError({
          code: ERROR_CODES.COLUNA_AMBIGUA,
          message: `Coluna ${ref.column} sem qualificador com mais de uma tabela.`,
          hint: "Qualifique alias.coluna (ex.: p.codprod). Não deixe o validador adivinhar a tabela.",
        });
      }
    } else if (!aliasConhecido(ast, cteNomes, ref.table)) {
      throw new DomainError({
        code: ERROR_CODES.ALIAS_DESCONHECIDO,
        message: `Alias ${ref.table} não resolve para tabela deste SELECT.`,
        hint: "Use um alias declarado no FROM/JOIN ou o nome da tabela do pacote.",
      });
    }
    const resolved = resolveTabela(ast, cteNomes, ref.table);
    if (!resolved) {
      throw new DomainError({
        code: ERROR_CODES.COLUNA_AMBIGUA,
        message: `Não foi possível resolver a tabela de ${ref.column}.`,
        hint: "Qualifique a coluna com o alias do FROM.",
      });
    }
    if (resolved.skipEscopo) {
      continue;
    }
    if (!colunaNoEscopo(escopo, resolved.nome, ref.column)) {
      throw new DomainError({
        code: ERROR_CODES.COLUNA_FORA_DO_ESCOPO,
        message: `Coluna ${ref.column} não existe neste dataset.`,
        hint: hintComProximos(
          `Disponíveis para filtro em ${resolved.nome}:`,
          ref.column,
          colunasDaTabela(escopo, resolved.nome),
        ),
      });
    }
  }
  for (const join of ast.joins) {
    if (join.tipoJoin.includes("cross")) {
      throw new DomainError({
        code: ERROR_CODES.JOIN_DESCONHECIDO,
        message: "CROSS JOIN / produto cartesiano é recusado.",
        hint: "Declare INNER/LEFT JOIN com igualdade de colunas conhecidas no grafo.",
      });
    }
    if (join.equalities.length === 0) {
      throw new DomainError({
        code: ERROR_CODES.JOIN_DESCONHECIDO,
        message: "JOIN sem igualdade conhecida no escopo.",
        hint: "Use ON alias.coluna = alias.coluna de um relacionamento publicado. Chame confirmar_relacionamento para ensinar um novo.",
      });
    }
    const eqs: IgualdadeResolvida[] = [];
    for (const eq of join.equalities) {
      if (!aliasConhecido(ast, cteNomes, eq.leftAlias)) {
        throw new DomainError({
          code: ERROR_CODES.ALIAS_DESCONHECIDO,
          message: `Alias ${eq.leftAlias} do JOIN não resolve.`,
          hint: "O ON precisa usar alias declarados neste SELECT.",
        });
      }
      if (!aliasConhecido(ast, cteNomes, eq.rightAlias)) {
        throw new DomainError({
          code: ERROR_CODES.ALIAS_DESCONHECIDO,
          message: `Alias ${eq.rightAlias} do JOIN não resolve.`,
          hint: "O ON precisa usar alias declarados neste SELECT.",
        });
      }
      const leftTable = resolveTabela(ast, cteNomes, eq.leftAlias);
      const rightTable = resolveTabela(ast, cteNomes, eq.rightAlias);
      if (!leftTable || !rightTable) {
        throw new DomainError({
          code: ERROR_CODES.JOIN_DESCONHECIDO,
          message: "JOIN com alias não resolvido.",
          hint: "Declare FROM/JOIN com alias e ON alias.coluna = alias.coluna.",
        });
      }
      if (leftTable.skipEscopo || rightTable.skipEscopo) {
        continue;
      }
      eqs.push({
        leftTable: leftTable.nome,
        leftColumn: eq.leftColumn,
        rightTable: rightTable.nome,
        rightColumn: eq.rightColumn,
      });
    }
    if (eqs.length > 0 && !joinConjuntoConhecido(escopo, eqs)) {
      const label = eqs
        .map((eq) => `${eq.leftTable}.${eq.leftColumn} = ${eq.rightTable}.${eq.rightColumn}`)
        .join(" AND ");
      throw new DomainError({
        code: ERROR_CODES.JOIN_DESCONHECIDO,
        message: `JOIN ${label} não está no escopo como conjunto.`,
        hint: "Não invente relacionamento. Confirme o JOIN composto com confirmar_relacionamento (pares[]) / expandir_escopo.",
      });
    }
  }
  const cteProximo = new Set([...cteNomes, ...ast.cteNomes.map(lower)]);
  for (const sub of ast.subqueries) {
    validarSelect(sub, escopo, new Set([...cteProximo, ...sub.cteNomes.map(lower)]), false);
  }
  for (const branch of ast.setBranches) {
    validarSelect(branch, escopo, new Set([...cteProximo, ...branch.cteNomes.map(lower)]), false);
  }
};

const assertRecorte = (ast: SqlAstSelect): void => {
  if (!ast.temWhere && !ast.temAgregacaoLocal) {
    throw new DomainError({
      code: ERROR_CODES.CONSULTA_SEM_RECORTE,
      message: "Consulta sem recorte nem agregação.",
      hint: "Adicione WHERE (período, empresa, status) ou agregue no banco (SUM/COUNT/GROUP BY/OVER). Não puxe a listagem para somar na IA.",
    });
  }
  for (const branch of ast.setBranches) {
    assertRecorte(branch);
  }
};

export const exigirPaginacaoEstavel = (
  sql: string,
  ast: SqlAstSelect | null,
  options?: { page?: number; pageSize?: number },
): void => {
  if (!options?.page || !options.pageSize) {
    return;
  }
  const temOrderBy = ast !== null ? temOrderByNoSelectExterno(ast) : sqlTemOrderByExterno(sql);
  if (!temOrderBy) {
    throw new DomainError({
      code: ERROR_CODES.VALIDATION_ERROR,
      message: "Paginação exige ORDER BY.",
      hint: "Sem ordem estável a página repete e perde linha. Inclua ORDER BY no SELECT externo (sqlModelo ou sql).",
    });
  }
  const temLimite =
    ast !== null
      ? temLimiteNoSelectExterno(ast) || sqlDeclaraLimiteExterno(sql)
      : sqlDeclaraLimiteExterno(sql);
  if (temLimite) {
    throw new DomainError({
      code: ERROR_CODES.VALIDATION_ERROR,
      message: "Paginação via options.page não pode conviver com TOP/LIMIT/FIRST no SQL.",
      hint: "A reescrita gerenciada controla o corte de linhas. Remova TOP/LIMIT/OFFSET/FETCH/FIRST/START AT do SQL e deixe só ORDER BY; envie options.page e options.page_size juntos.",
    });
  }
};

export const validarSqlNoEscopo = (
  sql: string,
  dialeto: Dialeto,
  escopo: EscopoSkill,
  options?: { page?: number; pageSize?: number; modo?: ModoValidacaoEscopo },
): SqlAstSelect => {
  const modo = options?.modo ?? "consulta";
  const ast = parseSelect(sql, dialeto);
  const cteNomes = new Set(ast.cteNomes.map(lower));
  validarSelect(ast, escopo, cteNomes, modo === "inspecao");
  if (modo !== "inspecao") {
    assertRecorte(ast);
  }
  exigirPaginacaoEstavel(sql, ast, options);
  return ast;
};

export const coletarAvisosValidacao = (ast: SqlAstSelect): { code: string; message: string }[] => {
  const avisos: { code: string; message: string }[] = [];
  if (ast.temLiteralTextoFiltro) {
    avisos.push({
      code: "LITERAL_TEXTO",
      message:
        "Há literal de texto em WHERE/HAVING. Prefira params nomeados (:nome) para o valor que o usuário informou.",
    });
  }
  return avisos;
};
