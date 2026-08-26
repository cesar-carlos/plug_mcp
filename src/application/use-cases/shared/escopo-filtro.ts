import { DomainError } from "../../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../../domain/errors/error-codes.js";
import type { EscopoPadraoAcesso } from "../../../domain/entities/escopo.js";
import { extractNamedParams } from "./sql-scan.js";
import { tryParseSelect } from "./sql-ast.js";
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

const temPredicadoParam = (
  sql: string,
  colunas: readonly string[],
  param: "empresa" | "filial",
  dialeto?: Dialeto,
): boolean => {
  const placeholders = new Set(extractNamedParams(sql).map((nome) => nome.toLowerCase()));
  if (!placeholders.has(param)) {
    return false;
  }
  const ast = tryParseSelect(sql, dialeto);
  if (!ast) {
    return false;
  }
  return ast.filtroRefs.some((ref) => colunaCasa(ref.column, colunas));
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
  const colunas = Object.values(input.colunasDasTabelas).flat();
  const bindings = input.escopoPadrao.bindings ?? [];
  if (bindings.length > 0) {
    for (const binding of bindings) {
      const valor =
        binding.param === "empresa" ? input.escopoPadrao.empresa : input.escopoPadrao.filial;
      if (!valor) {
        continue;
      }
      if (!temPredicadoParam(input.sql, [binding.coluna], binding.param, input.dialeto)) {
        throw new DomainError({
          code: ERROR_CODES.ESCOPO_FILTRO_AUSENTE,
          message: `A consulta não recorta ${binding.param} em ${binding.tabela}.${binding.coluna}.`,
          hint: `Inclua ${binding.tabela}.${binding.coluna} = :${binding.param} (valor do acesso).`,
        });
      }
    }
    return;
  }
  if (input.escopoPadrao.empresa) {
    const temColuna = colunas.some((nome) => colunaCasa(nome, NOMES_COLUNA_EMPRESA));
    if (
      temColuna &&
      !temPredicadoParam(input.sql, NOMES_COLUNA_EMPRESA, "empresa", input.dialeto)
    ) {
      throw new DomainError({
        code: ERROR_CODES.ESCOPO_FILTRO_AUSENTE,
        message: "A consulta não recorta empresa, mas o acesso tem empresa default.",
        hint: `Inclua predicado na coluna de empresa = :empresa (valor ${input.escopoPadrao.empresa}).`,
      });
    }
  }
  if (input.escopoPadrao.filial) {
    const temColuna = colunas.some((nome) => colunaCasa(nome, NOMES_COLUNA_FILIAL));
    if (temColuna && !temPredicadoParam(input.sql, NOMES_COLUNA_FILIAL, "filial", input.dialeto)) {
      throw new DomainError({
        code: ERROR_CODES.ESCOPO_FILTRO_AUSENTE,
        message: "A consulta não recorta filial, mas o acesso tem filial default.",
        hint: `Inclua predicado na coluna de filial = :filial (valor ${input.escopoPadrao.filial}).`,
      });
    }
  }
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
