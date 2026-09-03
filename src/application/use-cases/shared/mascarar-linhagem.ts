import { createHmac } from "node:crypto";
import type { SqlAstSelect } from "./sql-ast.js";
import {
  inferirSensibilidadeColuna,
  maxSensibilidade,
  type SensibilidadeColuna,
} from "../../../domain/entities/privacidade.js";
import type { GrafoRepositoryPort } from "../../../domain/ports/grafo-repository.port.js";

export const REDACTED = "[redacted]";
export const TEXTO_OCULTO = "[texto oculto]";

const resolverNomeFisico = (ast: SqlAstSelect, aliasOrName: string | null): string | null => {
  if (!aliasOrName) {
    return null;
  }
  const wanted = aliasOrName.toLowerCase();
  for (const tabela of ast.tabelas) {
    if (tabela.nome.toLowerCase() === wanted) {
      return tabela.nome;
    }
    if (tabela.alias?.toLowerCase() === wanted) {
      return tabela.nome;
    }
  }
  for (const join of ast.joins) {
    if (join.tabela.toLowerCase() === wanted) {
      return join.tabela;
    }
    if (join.alias?.toLowerCase() === wanted) {
      return join.tabela;
    }
  }
  return aliasOrName;
};

const origensDaExpr = (
  ast: SqlAstSelect,
  expr: string,
  table: string | null,
  column: string | null,
  isExpression: boolean,
): { table: string | null; column: string }[] => {
  if (!isExpression && column) {
    return [{ table: resolverNomeFisico(ast, table), column }];
  }
  const refs: { table: string | null; column: string }[] = [];
  const normalized = expr.replace(/[[\]"`]/g, "");
  const re = /([A-Za-z_][A-Za-z0-9_$#]*)\.([A-Za-z_][A-Za-z0-9_$#]*)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(normalized)) !== null) {
    refs.push({
      table: resolverNomeFisico(ast, match[1] ?? null),
      column: match[2] ?? "",
    });
  }
  if (refs.length === 0) {
    const bare =
      /\b(?:max|min|sum|avg|count)\s*\(\s*(?:distinct\s+)?([A-Za-z_][A-Za-z0-9_$#]*)\s*\)/i.exec(
        normalized,
      );
    if (bare?.[1]) {
      refs.push({ table: resolverNomeFisico(ast, table), column: bare[1] });
    }
  }
  return refs.filter((ref) => ref.column.length > 0);
};

export const linhagemColunas = (
  ast: SqlAstSelect | null,
  outputColumns: readonly string[],
): Map<string, { table: string | null; column: string }[]> => {
  const map = new Map<string, { table: string | null; column: string }[]>();
  if (!ast) {
    for (const name of outputColumns) {
      map.set(name, [{ table: null, column: name }]);
    }
    return map;
  }
  const byAlias = new Map<string, (typeof ast.colunas)[number]>();
  for (const coluna of ast.colunas) {
    if (coluna.alias) {
      byAlias.set(coluna.alias.toLowerCase(), coluna);
    }
    if (coluna.column) {
      byAlias.set(coluna.column.toLowerCase(), coluna);
    }
  }
  for (const name of outputColumns) {
    const coluna = byAlias.get(name.toLowerCase());
    if (!coluna) {
      map.set(name, [{ table: null, column: name }]);
      continue;
    }
    map.set(
      name,
      origensDaExpr(ast, coluna.expr, coluna.table, coluna.column, coluna.isExpression),
    );
  }
  return map;
};

export const resolverSensibilidade = (
  origens: readonly { table: string | null; column: string }[],
  lookup: (tabela: string | null, coluna: string) => SensibilidadeColuna | null,
): SensibilidadeColuna => {
  const values: SensibilidadeColuna[] = origens.map((origem) => {
    const stored = lookup(origem.table, origem.column);
    if (stored) {
      return stored;
    }
    return inferirSensibilidadeColuna(origem.column);
  });
  return maxSensibilidade(values);
};

const pseudo = (sessaoId: string, value: string): string => {
  const digest = createHmac("sha256", sessaoId).update(value).digest("hex").slice(0, 10);
  return `p_${digest}`;
};

export const mascararValor = (
  value: unknown,
  sensibilidade: SensibilidadeColuna,
  sessaoId: string,
): unknown => {
  if (value == null) {
    return value;
  }
  if (sensibilidade === "segredo") {
    return REDACTED;
  }
  if (sensibilidade === "sensivel") {
    return TEXTO_OCULTO;
  }
  if (sensibilidade === "pessoal") {
    const texto =
      typeof value === "string" || typeof value === "number" || typeof value === "boolean"
        ? String(value)
        : REDACTED;
    return pseudo(sessaoId, texto);
  }
  return value;
};

export const mascararParams = (
  params: Record<string, unknown>,
  lookupNome: (nome: string) => SensibilidadeColuna,
  sessaoId: string,
): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [nome, value] of Object.entries(params)) {
    out[nome] = mascararValor(value, lookupNome(nome), sessaoId);
  }
  return out;
};

export const mascararLinhas = (input: {
  columns: readonly string[];
  rows: readonly Record<string, unknown>[];
  ast: SqlAstSelect | null;
  sessaoId: string;
  lookup: (tabela: string | null, coluna: string) => SensibilidadeColuna | null;
  incluirPessoal?: boolean;
}): { rows: Record<string, unknown>[]; colunasMascaradas: string[] } => {
  const incluirPessoal = input.incluirPessoal !== false;
  const lineage = linhagemColunas(input.ast, input.columns);
  const colunasMascaradas: string[] = [];
  const classePorColuna = new Map<string, SensibilidadeColuna>();
  for (const name of input.columns) {
    let classe = resolverSensibilidade(
      lineage.get(name) ?? [{ table: null, column: name }],
      input.lookup,
    );
    if (!incluirPessoal && (classe === "pessoal" || classe === "sensivel")) {
      classe = "livre";
    }
    classePorColuna.set(name, classe);
    if (classe !== "livre") {
      colunasMascaradas.push(name);
    }
  }
  const rows = input.rows.map((row) => {
    const next: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      const classe = classePorColuna.get(key) ?? inferirSensibilidadeColuna(key);
      next[key] = mascararValor(value, classe, input.sessaoId);
    }
    return next;
  });
  return { rows, colunasMascaradas };
};

export const lookupSensibilidadeGrafo = async (
  grafo: GrafoRepositoryPort,
  acessoId: string,
  tabelas: readonly string[],
): Promise<(tabela: string | null, coluna: string) => SensibilidadeColuna | null> => {
  const map = new Map<string, SensibilidadeColuna>();
  for (const nome of tabelas) {
    const tabela = await grafo.findTabelaByNome(acessoId, nome);
    if (!tabela) {
      continue;
    }
    const cols = await grafo.listColunas(acessoId, tabela.id);
    for (const coluna of cols) {
      map.set(`${tabela.nome.toLowerCase()}.${coluna.nome.toLowerCase()}`, coluna.sensibilidade);
      map.set(coluna.nome.toLowerCase(), coluna.sensibilidade);
    }
  }
  return (tabela, coluna) => {
    if (tabela) {
      return map.get(`${tabela.toLowerCase()}.${coluna.toLowerCase()}`) ?? null;
    }
    return map.get(coluna.toLowerCase()) ?? inferirSensibilidadeColuna(coluna);
  };
};
