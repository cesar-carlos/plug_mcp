import { DomainError } from "../../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../../domain/errors/error-codes.js";
import type { EscopoPadraoAcesso } from "../../../domain/entities/escopo.js";
import { extractNamedParams } from "./sql-modelo.js";

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

const temIdent = (sql: string, nomes: readonly string[]): boolean => {
  const lower = sql.toLowerCase();
  return nomes.some((nome) => new RegExp(`\\b${nome}\\b`, "i").test(lower));
};

const colunaCasa = (nome: string, candidatos: readonly string[]): boolean =>
  candidatos.some((item) => item.toLowerCase() === nome.toLowerCase());

export const exigirFiltroEscopoPadrao = (input: {
  sql: string;
  colunasDasTabelas: Readonly<Record<string, readonly string[]>>;
  escopoPadrao: EscopoPadraoAcesso | null;
}): void => {
  if (!input.escopoPadrao) {
    return;
  }
  const colunas = Object.values(input.colunasDasTabelas).flat();
  if (input.escopoPadrao.empresa) {
    const temColuna = colunas.some((nome) => colunaCasa(nome, NOMES_COLUNA_EMPRESA));
    if (temColuna && !temIdent(input.sql, NOMES_COLUNA_EMPRESA)) {
      throw new DomainError({
        code: ERROR_CODES.ESCOPO_FILTRO_AUSENTE,
        message: "A consulta não recorta empresa, mas o acesso tem empresa default.",
        hint: `Inclua predicado na coluna de empresa (valor ${input.escopoPadrao.empresa}) via params nomeados.`,
      });
    }
  }
  if (input.escopoPadrao.filial) {
    const temColuna = colunas.some((nome) => colunaCasa(nome, NOMES_COLUNA_FILIAL));
    if (temColuna && !temIdent(input.sql, NOMES_COLUNA_FILIAL)) {
      throw new DomainError({
        code: ERROR_CODES.ESCOPO_FILTRO_AUSENTE,
        message: "A consulta não recorta filial, mas o acesso tem filial default.",
        hint: `Inclua predicado na coluna de filial (valor ${input.escopoPadrao.filial}) via params nomeados.`,
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
  if (escopoPadrao.empresa !== undefined && next.empresa === undefined) {
    next.empresa = escopoPadrao.empresa;
  }
  if (escopoPadrao.filial !== undefined && next.filial === undefined) {
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
