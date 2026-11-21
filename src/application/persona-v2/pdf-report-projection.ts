import type { GeneratedPdfContract } from "../../domain/persona-v2/pdf-report.js";
import { PersonaV2Error } from "../../domain/persona-v2/model.js";

/** Never infer export authority from a label or silently drop unapproved outputs. */
export function assertPdfReportProjection(
  columns: readonly { alias: string }[],
  contract: GeneratedPdfContract,
): void {
  const aliases = columns.map((column) => column.alias);
  if (
    !aliases.length ||
    new Set(aliases).size !== aliases.length ||
    aliases.some((alias) => !contract.columns.includes(alias))
  ) {
    throw new PersonaV2Error(
      "INVALID_PLAN",
      "Projeção PDF exige aliases únicos declarados no contrato.",
    );
  }
}
