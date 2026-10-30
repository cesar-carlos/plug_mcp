import { z } from "zod";
import { PersonaV2Error } from "../../domain/persona-v2/model.js";
import { executableField } from "../../domain/persona-v2/field-use.js";
import type { QueryTraining } from "./query-training.js";

const text = z.string().trim().min(1).max(2000);
const field = z.strictObject({
  table: z.string().min(1).max(200),
  column: z.string().min(1).max(100),
});
/** Editorial definitions, never SQL fragments or an alternative execution authority. */
export const querySemanticsSchema = z.strictObject({
  version: z.literal(1),
  synonyms: z.array(z.string().trim().min(2).max(100)).max(30),
  metrics: z
    .array(
      z.strictObject({
        id: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
        name: text,
        definition: text,
        aggregation: z.enum([
          "sum",
          "count",
          "count_distinct",
          "min",
          "max",
          "average",
          "ratio",
          "classification",
        ]),
        inputs: z.array(field).min(1).max(32),
        grain: z.array(field).min(1).max(32),
        unit: text,
        timePolicy: text,
        filters: z.array(text).max(30),
        nullPolicy: text,
        negativePolicy: text,
        reconciliation: text,
      }),
    )
    .max(50),
});

export function assertQuerySemantics(training: QueryTraining): void {
  const semantics = training.semantics;
  if (!semantics) return;
  const unique = (values: readonly string[]) => new Set(values).size === values.length;
  if (
    !unique(semantics.metrics.map((m) => m.id)) ||
    !unique(semantics.synonyms.map((s) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()))
  ) {
    throw new PersonaV2Error("INVALID_PLAN", "Métricas e sinônimos exigem identidades únicas.");
  }
  for (const metric of semantics.metrics) {
    for (const refs of [metric.inputs, metric.grain]) {
      if (
        !unique(refs.map((r) => `${r.table}.${r.column}`)) ||
        refs.some((ref) => {
          const column = training.columns.find(
            (c) => c.table === ref.table && c.name === ref.column,
          );
          return !column || !executableField(column);
        })
      ) {
        throw new PersonaV2Error(
          "INVALID_PLAN",
          "Métrica exige referências únicas a campos executáveis treinados.",
        );
      }
    }
  }
}
