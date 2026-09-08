import type { PoliticaConsulta } from "../../../domain/entities/politica-consulta.js";
import { DomainError } from "../../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../../domain/errors/error-codes.js";
import type { SqlAstSelect } from "./sql-ast.js";

export interface RecomendacaoConsulta {
  readonly code: "AGREGAR" | "RECORTAR_PERIODO" | "REDUZIR_JOINS" | "PAGINAR";
  readonly motivo: string;
  readonly bloqueante: boolean;
  readonly nextAction: "ajustar_sql" | "usar_consulta_semantica" | "reduzir_recorte";
}

const recusarOrcamento = (
  message: string,
  hint: string,
  recomendacoes: readonly RecomendacaoConsulta[],
): never => {
  throw DomainError.pacote({
    code: ERROR_CODES.CONSULTA_ORCAMENTO,
    message,
    hint,
    details: { recomendacoes },
  });
};

export const recomendacoesDeOrcamento = (input: {
  ast: SqlAstSelect | null;
  politica: PoliticaConsulta | null;
  maxRows: number;
}): readonly RecomendacaoConsulta[] => {
  const out: RecomendacaoConsulta[] = [];
  if (input.politica?.maxRows != null && input.maxRows > input.politica.maxRows) {
    out.push({
      code: "PAGINAR",
      motivo: "max_rows excede o teto da skill.",
      bloqueante: true,
      nextAction: "reduzir_recorte",
    });
  }
  if (
    input.politica?.maxTabelas != null &&
    input.ast &&
    input.ast.tabelas.length > input.politica.maxTabelas
  ) {
    out.push({
      code: "REDUZIR_JOINS",
      motivo: "A consulta excede o teto de tabelas da skill.",
      bloqueante: true,
      nextAction: "ajustar_sql",
    });
  }
  if (
    input.politica?.exigirRecorteTemporal &&
    input.ast &&
    !input.ast.temAgregacao &&
    !input.ast.filtroRefs.some((ref) => /data|date|venc|emiss/i.test(ref.column))
  ) {
    out.push({
      code: "RECORTAR_PERIODO",
      motivo: "Consulta detalhada sem recorte temporal.",
      bloqueante: true,
      nextAction: "reduzir_recorte",
    });
  }
  if (
    input.politica?.modoPreferencial === "agregado" &&
    input.ast &&
    !input.ast.temAgregacao &&
    !input.ast.temWhere
  ) {
    out.push({
      code: "AGREGAR",
      motivo: "A política prefere resultado agregado.",
      bloqueante: true,
      nextAction: "usar_consulta_semantica",
    });
  }
  return out;
};

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
    recusarOrcamento(
      `max_rows ${input.maxRows} excede o teto da skill (${politica.maxRows}).`,
      "Agregue no banco ou peça um recorte menor.",
      recomendacoesDeOrcamento(input),
    );
  }
  if (politica.maxRows != null) {
    maxRows = Math.min(maxRows, politica.maxRows);
  }
  if (politica.maxTabelas != null && input.ast && input.ast.tabelas.length > politica.maxTabelas) {
    recusarOrcamento(
      `A consulta usa ${input.ast.tabelas.length} tabelas; o teto da skill é ${politica.maxTabelas}.`,
      "Reduza o JOIN ou use a consulta exemplo.",
      recomendacoesDeOrcamento(input),
    );
  }
  if (
    politica.exigirRecorteTemporal === true &&
    input.ast &&
    !input.ast.temAgregacao &&
    !input.ast.filtroRefs.some((ref) => /data|date|venc|emiss/i.test(ref.column))
  ) {
    recusarOrcamento(
      "A skill exige recorte temporal para consulta detalhada.",
      "Filtre por data de vencimento/pagamento ou agregue.",
      recomendacoesDeOrcamento(input),
    );
  }
  if (
    politica.modoPreferencial === "agregado" &&
    input.ast &&
    !input.ast.temAgregacao &&
    !input.ast.temWhere
  ) {
    recusarOrcamento(
      "A skill prefere consulta agregada.",
      "Use SUM/GROUP BY ou a consulta semântica certificada.",
      recomendacoesDeOrcamento(input),
    );
  }
  const timeoutMs =
    politica.timeoutMs != null && input.timeoutMs != null
      ? Math.min(input.timeoutMs, politica.timeoutMs)
      : (input.timeoutMs ?? politica.timeoutMs);
  return { maxRows, timeoutMs };
};
