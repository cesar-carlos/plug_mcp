import { PersonaV2Error } from "../persona-v2/model.js";

export type PaginationReason =
  | "order_not_simple"
  | "order_not_projected"
  | "qualified_order_requires_simple_projection"
  | "duplicate_projection_alias";
interface PublicationContext {
  publicationIds: readonly string[];
  publicationRevisions: readonly number[];
  queryOrigin: "modelo_publicado" | "sql_fornecido";
}
const reasons = new WeakMap<PersonaV2Error, PaginationReason>();
const contexts = new WeakMap<PersonaV2Error, PublicationContext>();
const explanations: Record<PaginationReason, string> = {
  order_not_simple: "A ordenação contém expressão, posição ou modificador não suportado.",
  order_not_projected: "A ordenação não corresponde a uma saída projetada única.",
  qualified_order_requires_simple_projection:
    "A projeção agregada ou calculada exige ordenar pelo alias de saída sem prefixo de tabela.",
  duplicate_projection_alias: "Há nomes de saída duplicados na projeção.",
};
export function paginationFailure(reason: PaginationReason): PersonaV2Error {
  const error = new PersonaV2Error(
    "INVALID_PLAN",
    `Paginação exige ORDER BY com nomes ou aliases simples da projeção. ${explanations[reason]} Use um alias projetado sem prefixo de tabela, expressão, posição numérica ou NULLS FIRST/LAST; mantenha options.page e options.pageSize, sem limite SQL. A consulta não foi enviada; revise explicitamente o SQL, sem repetição automática.`,
  );
  reasons.set(error, reason);
  return error;
}
export function paginationReason(error: unknown): PaginationReason | undefined {
  return error instanceof PersonaV2Error ? reasons.get(error) : undefined;
}
export function recordPaginationPublications(error: unknown, context: PublicationContext): void {
  if (error instanceof PersonaV2Error && reasons.has(error))
    contexts.set(error, {
      ...context,
      publicationIds: [...context.publicationIds],
      publicationRevisions: [...context.publicationRevisions],
    });
}
export function paginationDiagnostic(error: unknown): Record<string, unknown> {
  if (!(error instanceof PersonaV2Error) || !reasons.has(error)) return {};
  return { paginationReason: reasons.get(error), ...(contexts.get(error) ?? {}) };
}
