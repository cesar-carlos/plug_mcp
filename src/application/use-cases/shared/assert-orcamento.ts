import type { PoliticaConsulta } from "../../../domain/entities/politica-consulta.js";
import { DomainError } from "../../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../../domain/errors/error-codes.js";
import type { SqlAstSelect } from "./sql-ast.js";

export const assertOrcamentoConsulta = (input: {
  ast: SqlAstSelect | null;
  politica: PoliticaConsulta | null;
  maxRows: number;
  timeoutMs?: number;
}): { maxRows: number; timeoutMs?: number } => {
  const politica = input.politica;
  if (!politica) {
    return { maxRows: input.maxRows, timeoutMs: input.timeoutMs };
  }
  let maxRows = input.maxRows;
  if (politica.maxRows != null && input.maxRows > politica.maxRows) {
    throw DomainError.pacote({
      code: ERROR_CODES.CONSULTA_ORCAMENTO,
      message: `max_rows ${input.maxRows} excede o teto da skill (${politica.maxRows}).`,
      hint: "Agregue no banco ou peça um recorte menor.",
    });
  }
  if (politica.maxRows != null) {
    maxRows = Math.min(maxRows, politica.maxRows);
  }
  if (politica.maxTabelas != null && input.ast && input.ast.tabelas.length > politica.maxTabelas) {
    throw DomainError.pacote({
      code: ERROR_CODES.CONSULTA_ORCAMENTO,
      message: `A consulta usa ${input.ast.tabelas.length} tabelas; o teto da skill é ${politica.maxTabelas}.`,
      hint: "Reduza o JOIN ou use a consulta exemplo.",
    });
  }
  if (
    politica.exigirRecorteTemporal === true &&
    input.ast &&
    !input.ast.temAgregacao &&
    !input.ast.filtroRefs.some((ref) => /data|date|venc|emiss/i.test(ref.column))
  ) {
    throw DomainError.pacote({
      code: ERROR_CODES.CONSULTA_ORCAMENTO,
      message: "A skill exige recorte temporal para consulta detalhada.",
      hint: "Filtre por data de vencimento/pagamento ou agregue.",
    });
  }
  if (
    politica.modoPreferencial === "agregado" &&
    input.ast &&
    !input.ast.temAgregacao &&
    !input.ast.temWhere
  ) {
    throw DomainError.pacote({
      code: ERROR_CODES.CONSULTA_ORCAMENTO,
      message: "A skill prefere consulta agregada.",
      hint: "Use SUM/GROUP BY ou a consulta semântica certificada.",
    });
  }
  const timeoutMs =
    politica.timeoutMs != null && input.timeoutMs != null
      ? Math.min(input.timeoutMs, politica.timeoutMs)
      : (input.timeoutMs ?? politica.timeoutMs);
  return { maxRows, timeoutMs };
};
