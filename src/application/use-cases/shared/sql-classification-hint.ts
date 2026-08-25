import type { DomainError } from "../../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../../domain/errors/error-codes.js";

export const hintSqlNaoClassificavel = (tabelas: readonly string[] = []): string => {
  const base =
    "O agente não classificou este SQL para autorização. Confira se há FROM com tabela/view real e se o dialeto do acesso bate com o ERP (SQL Server → atualizar_dialeto para mssql). Não trate como token revogado.";
  const nomes = tabelas.map((nome) => nome.trim()).filter((nome) => nome.length > 0);
  if (nomes.length === 0) {
    return base;
  }
  return `${base} Tabelas no SQL enviado: ${nomes.join(", ")}.`;
};

export const isSqlClassificationDenial = (error: DomainError): boolean =>
  error.code === ERROR_CODES.INVALID_SQL && /não classificou este SQL/i.test(error.hint);
