import { DomainError } from "../../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../../domain/errors/error-codes.js";
import type { EscopoPadraoAcesso } from "../../../domain/entities/escopo.js";
import { extractNamedParams } from "./sql-scan.js";
import { parseSelect, type SqlAstSelect } from "./sql-ast.js";
import type { Dialeto } from "../../../domain/entities/dialeto.js";

export const NOMES_COLUNA_EMPRESA = [
  "empresa",
  "idempresa",
  "id_empresa",
  "codempresa",
  "cod_empresa",
] as const;

export const NOMES_COLUNA_FILIAL = [
  "filial",
  "idfilial",
  "id_filial",
  "codfilial",
  "cod_filial",
] as const;

const colunaCasa = (nome: string, candidatos: readonly string[]): boolean =>
  candidatos.some((item) => item.toLowerCase() === nome.toLowerCase());

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
const columnName = (value: unknown): string | null => {
  if (typeof value === "string") {
    return value;
  }
  const rec = record(value);
  return typeof rec?.value === "string" ? rec.value : rec?.expr ? columnName(rec.expr) : null;
};

/** A mandatory predicate must dominate every alternative; an AND needs either side. */
const implicaRecorte = (
  node: unknown,
  alias: string,
  coluna: string,
  param: string,
  single: boolean,
): boolean => {
  const expr = record(node);
  if (expr?.type !== "binary_expr") {
    return false;
  }
  const op = String(expr.operator).toUpperCase();
  if (op === "AND") {
    return (
      implicaRecorte(expr.left, alias, coluna, param, single) ||
      implicaRecorte(expr.right, alias, coluna, param, single)
    );
  }
  if (op === "OR") {
    return (
      implicaRecorte(expr.left, alias, coluna, param, single) &&
      implicaRecorte(expr.right, alias, coluna, param, single)
    );
  }
  if (op !== "=") {
    return false;
  }
  const matches = (left: unknown, right: unknown): boolean => {
    const col = record(left),
      bound = record(right);
    return (
      col?.type === "column_ref" &&
      columnName(col.column)?.toLowerCase() === coluna.toLowerCase() &&
      (col.table == null
        ? single
        : (typeof col.table === "string" ? col.table : "").toLowerCase() === alias.toLowerCase()) &&
      bound?.type === "param" &&
      bound.value === param
    );
  };
  return matches(expr.left, expr.right) || matches(expr.right, expr.left);
};

export const exigirFiltroEscopoPadrao = (input: {
  sql: string;
  colunasDasTabelas: Readonly<Record<string, readonly string[]>>;
  escopoPadrao: EscopoPadraoAcesso | null;
  dialeto?: Dialeto;
}): void => {
  if (!input.escopoPadrao) {
    return;
  }
  const defaults = input.escopoPadrao;
  const bindings = defaults.bindings ?? [];
  const visit = (ast: SqlAstSelect): void => {
    const tables = ast.tabelas.filter((table) => !table.isCte && !table.isSubquery);
    for (const table of tables) {
      const cols =
        Object.entries(input.colunasDasTabelas).find(
          ([name]) => name.toLowerCase() === table.nome.toLowerCase(),
        )?.[1] ?? [];
      for (const param of ["empresa", "filial"] as const) {
        if (defaults[param] === undefined) {
          continue;
        }
        const configured = bindings.filter(
          (b) => b.param === param && b.tabela.toLowerCase() === table.nome.toLowerCase(),
        );
        const candidates =
          configured.length > 0
            ? configured.map((b) => b.coluna)
            : bindings.some((b) => b.param === param)
              ? []
              : cols.filter((c) =>
                  colunaCasa(c, param === "empresa" ? NOMES_COLUNA_EMPRESA : NOMES_COLUNA_FILIAL),
                );
        if (candidates.length === 0 && !bindings.some((b) => b.param === param)) {
          throw DomainError.pacote({
            code: ERROR_CODES.ESCOPO_FILTRO_AUSENTE,
            message: `Não foi possível identificar o recorte físico de ${param} em ${table.nome}.`,
            hint: "Inclua a coluna de recorte no pacote ou configure bindings físicos do acesso. Tabelas globais só são admitidas quando os bindings do recorte estão explicitamente configurados.",
          });
        }
        if (candidates.length > 1 && configured.length === 0) {
          throw DomainError.pacote({
            code: ERROR_CODES.ESCOPO_FILTRO_AUSENTE,
            message: "Recorte padrão ambíguo.",
            hint: "Configure o binding físico de empresa/filial neste acesso.",
          });
        }
        for (const col of candidates) {
          if (
            !implicaRecorte(
              ast.whereAst,
              table.alias ?? table.nome,
              col,
              param,
              tables.length === 1,
            )
          ) {
            throw DomainError.pacote({
              code: ERROR_CODES.ESCOPO_FILTRO_AUSENTE,
              message: `A consulta não garante o recorte de ${param} em ${table.nome}.${col}.`,
              hint: `Inclua ${table.alias ?? table.nome}.${col} = :${param} em todos os caminhos lógicos deste SELECT.`,
            });
          }
        }
      }
    }
    for (const child of [...ast.subqueries, ...ast.setBranches]) {
      visit(child);
    }
  };
  visit(parseSelect(input.sql, input.dialeto ?? "mssql"));
};

export const mesclarParamsEscopo = (
  params: Record<string, unknown>,
  escopoPadrao: EscopoPadraoAcesso | null,
): Record<string, unknown> => {
  if (!escopoPadrao) {
    return params;
  }
  const next = { ...params };
  if (escopoPadrao.empresa !== undefined) {
    next.empresa = escopoPadrao.empresa;
  }
  if (escopoPadrao.filial !== undefined) {
    next.filial = escopoPadrao.filial;
  }
  return next;
};

export const avisosPlaceholderEscopo = (input: {
  sql: string;
  colunasDasTabelas: Readonly<Record<string, readonly string[]>>;
  escopoPadrao: EscopoPadraoAcesso | null;
}): { code: string; message: string }[] => {
  if (!input.escopoPadrao) {
    return [];
  }
  const colunas = Object.values(input.colunasDasTabelas).flat();
  const placeholders = new Set(extractNamedParams(input.sql).map((nome) => nome.toLowerCase()));
  const avisos: { code: string; message: string }[] = [];
  if (input.escopoPadrao.empresa) {
    const temColuna = colunas.some((nome) => colunaCasa(nome, NOMES_COLUNA_EMPRESA));
    if (temColuna && !placeholders.has("empresa")) {
      avisos.push({
        code: "PLACEHOLDER_ESCOPO",
        message: "Prefira :empresa no SQL em vez de literal para o recorte de empresa do acesso.",
      });
    }
  }
  if (input.escopoPadrao.filial) {
    const temColuna = colunas.some((nome) => colunaCasa(nome, NOMES_COLUNA_FILIAL));
    if (temColuna && !placeholders.has("filial")) {
      avisos.push({
        code: "PLACEHOLDER_ESCOPO",
        message: "Prefira :filial no SQL em vez de literal para o recorte de filial do acesso.",
      });
    }
  }
  return avisos;
};
