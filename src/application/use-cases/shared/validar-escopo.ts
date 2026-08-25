import type { EscopoSkill } from "../../../domain/entities/escopo.js";
import { DomainError } from "../../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../../domain/errors/error-codes.js";
import type { Dialeto } from "../../../domain/entities/dialeto.js";
import { collectColumnRefs, parseSelect, type SqlAstSelect } from "./sql-ast.js";
import { hintComProximos } from "./sugestoes.js";

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

const resolveTabela = (
  ast: SqlAstSelect,
  aliasOrName: string | null,
  escopo: EscopoSkill,
): string | null => {
  if (!aliasOrName) {
    return ast.tabelas.length === 1 ? (ast.tabelas[0]?.nome ?? null) : null;
  }
  const wanted = lower(aliasOrName);
  const byAlias = ast.tabelas.find(
    (tabela) =>
      (tabela.alias !== null && lower(tabela.alias) === wanted) || lower(tabela.nome) === wanted,
  );
  if (byAlias) {
    return byAlias.nome;
  }
  if (tabelaNoEscopo(escopo, aliasOrName)) {
    return aliasOrName;
  }
  return null;
};

const joinConhecido = (
  escopo: EscopoSkill,
  leftTable: string,
  leftCol: string,
  rightTable: string,
  rightCol: string,
): boolean =>
  escopo.relacionamentos.some((rel) => {
    const a =
      lower(rel.tabelaOrigem) === lower(leftTable) &&
      lower(rel.colunaOrigem) === lower(leftCol) &&
      lower(rel.tabelaDestino) === lower(rightTable) &&
      lower(rel.colunaDestino) === lower(rightCol);
    const b =
      lower(rel.tabelaOrigem) === lower(rightTable) &&
      lower(rel.colunaOrigem) === lower(rightCol) &&
      lower(rel.tabelaDestino) === lower(leftTable) &&
      lower(rel.colunaDestino) === lower(leftCol);
    return a || b;
  });

const validarSelect = (
  ast: SqlAstSelect,
  escopo: EscopoSkill,
  cteNomes: ReadonlySet<string>,
): void => {
  if (ast.temStar) {
    throw new DomainError({
      code: ERROR_CODES.INVALID_SQL,
      message: "SELECT * não é permitido.",
      hint: "Nomeie as colunas do dataset publicado.",
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
      });
    }
  }
  for (const ref of collectColumnRefs(ast)) {
    if (ref.column === "*") {
      continue;
    }
    const tabela = resolveTabela(ast, ref.table, escopo);
    if (!tabela || cteNomes.has(lower(tabela))) {
      continue;
    }
    if (!colunaNoEscopo(escopo, tabela, ref.column)) {
      throw new DomainError({
        code: ERROR_CODES.COLUNA_FORA_DO_ESCOPO,
        message: `Coluna ${ref.column} não existe neste dataset.`,
        hint: hintComProximos(
          `Disponíveis para filtro em ${tabela}:`,
          ref.column,
          colunasDaTabela(escopo, tabela),
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
    for (const eq of join.equalities) {
      const leftTable = resolveTabela(ast, eq.leftAlias, escopo);
      const rightTable = resolveTabela(ast, eq.rightAlias, escopo);
      if (!leftTable || !rightTable) {
        continue;
      }
      if (cteNomes.has(lower(leftTable)) || cteNomes.has(lower(rightTable))) {
        continue;
      }
      if (!joinConhecido(escopo, leftTable, eq.leftColumn, rightTable, eq.rightColumn)) {
        throw new DomainError({
          code: ERROR_CODES.JOIN_DESCONHECIDO,
          message: `JOIN ${leftTable}.${eq.leftColumn} = ${rightTable}.${eq.rightColumn} não está no escopo.`,
          hint: "Não invente relacionamento. Confirme com o usuário e chame confirmar_relacionamento / expandir_escopo.",
        });
      }
    }
  }
  for (const sub of ast.subqueries) {
    validarSelect(sub, escopo, new Set([...cteNomes, ...sub.cteNomes.map(lower)]));
  }
};

export const validarSqlNoEscopo = (
  sql: string,
  dialeto: Dialeto,
  escopo: EscopoSkill,
  options?: { page?: number },
): SqlAstSelect => {
  const ast = parseSelect(sql, dialeto);
  const cteNomes = new Set(ast.cteNomes.map(lower));
  validarSelect(ast, escopo, cteNomes);
  if (!ast.temWhere && !ast.temAgregacao) {
    throw new DomainError({
      code: ERROR_CODES.CONSULTA_SEM_RECORTE,
      message: "Consulta sem recorte nem agregação.",
      hint: "Adicione WHERE (período, empresa, status) ou agregue no banco (SUM/COUNT/GROUP BY). Não puxe a listagem para somar na IA.",
    });
  }
  if (options?.page && !ast.temOrderBy) {
    throw new DomainError({
      code: ERROR_CODES.VALIDATION_ERROR,
      message: "Paginação exige ORDER BY.",
      hint: "Sem ordem estável a página repete e perde linha. Inclua ORDER BY no SQL.",
    });
  }
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
