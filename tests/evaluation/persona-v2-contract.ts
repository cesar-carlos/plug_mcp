import { z } from "zod";
import { INTERACTION_ERROR_STAGES } from "../../src/domain/persona-v2/interaction-error-report.js";

export const PERSONA_EVALUATION_TOOLS = [
  "obter_contexto_persona",
  "obter_treinamento_base",
  "listar_fontes",
  "listar_skills",
  "obter_capacidades",
  "buscar_contexto",
  "obter_skill",
  "obter_grafo_conhecimento",
  "validar_consulta",
  "consultar_dados",
] as const;
const tool = z.enum(PERSONA_EVALUATION_TOOLS);
const id = z.string().min(1).max(200);
export const evaluationBindingSchema = z.strictObject({
  skillId: id,
  publicationId: id,
  sourceId: id,
});
export type EvaluationBinding = z.infer<typeof evaluationBindingSchema>;
export const evaluationContextSchema = z.strictObject({
  sources: z.array(id).min(1).readonly(),
  publications: z.array(id).min(1).readonly(),
  readAt: z.iso.datetime().optional(),
  complete: z.boolean(),
  limits: z.strictObject({
    maxRows: z.number().int().positive().optional(),
    pageSize: z.number().int().positive().optional(),
    maxBytes: z.number().int().positive().optional(),
    timeoutMs: z.number().int().positive().optional(),
  }),
});
export type EvaluationContext = z.infer<typeof evaluationContextSchema>;
export const evaluationDiagnosticSchema = z.strictObject({
  code: z.string().regex(/^[A-Z_]{1,80}$/),
  supportId: z.uuid().optional(),
  source: z
    .string()
    .regex(/^[a-z_]{1,80}$/)
    .optional(),
  retryable: z.boolean(),
  stage: z.enum(INTERACTION_ERROR_STAGES).optional(),
});
export type EvaluationDiagnostic = z.infer<typeof evaluationDiagnosticSchema>;
export interface EvaluationEvidence {
  status: "complete" | "partial" | "error" | "denied" | "unavailable";
  sources: readonly string[];
  publications: readonly string[];
  bindings?: readonly EvaluationBinding[];
  authorityRevision?: string;
  pagination?: { page: number; pageSize: number; hasNextPage: boolean };
  context?: EvaluationContext;
  diagnostic?: EvaluationDiagnostic;
}
export const evaluationBindingsSchema = z
  .array(evaluationBindingSchema)
  .min(1)
  .max(32)
  .readonly()
  .refine(
    (items) =>
      new Set(
        items.map((item) => JSON.stringify([item.skillId, item.publicationId, item.sourceId])),
      ).size === items.length,
    "Duplicate bindings",
  );
export const personaEvaluationReferenceSchema = z
  .strictObject({
    decision: z.enum(["responder", "esclarecer", "recusar", "indisponivel", "parcial"]),
    rows: z
      .array(
        z.record(z.string(), z.union([z.string(), z.number().finite(), z.boolean(), z.null()])),
      )
      .readonly(),
    sources: z.array(id).readonly(),
    publications: z.array(id).readonly(),
    bindings: evaluationBindingsSchema.optional(),
    behavior: z
      .strictObject({
        requiredTools: z.array(tool).max(PERSONA_EVALUATION_TOOLS.length).readonly().optional(),
        maxQueryCalls: z.number().int().min(0).max(32).optional(),
        forbidQueryAfterFailure: z.boolean().optional(),
        requireReadBindings: z.boolean().optional(),
        requirePaginationConsistency: z.boolean().optional(),
        requireAuthorityContinuity: z.boolean().optional(),
        requireAnswerContext: z.boolean().optional(),
        requireErrorDiagnostic: z.boolean().optional(),
        toolPrerequisites: z
          .array(
            z
              .strictObject({ before: tool, after: tool })
              .refine((rule) => rule.before !== rule.after, "Self prerequisite"),
          )
          .max(16)
          .readonly()
          .optional(),
      })
      .optional(),
  })
  .refine(
    (value) => !value.behavior?.requireReadBindings || !!value.bindings?.length,
    "Read bindings require expected bindings",
  );
export const personaEvaluationCaseSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9_-]{1,80}$/),
  group: z.enum(["supported", "security", "gap"]),
  question: z.string().min(1).max(16000),
  expected: personaEvaluationReferenceSchema,
  followUps: z
    .array(
      z.strictObject({
        question: z.string().min(1).max(16000),
        expected: personaEvaluationReferenceSchema,
      }),
    )
    .max(10)
    .readonly()
    .optional(),
});
export type PersonaEvaluationCase = z.infer<typeof personaEvaluationCaseSchema>;
export const personaEvaluationCasesSchema = z
  .array(personaEvaluationCaseSchema)
  .min(3)
  .max(1000)
  .readonly();
export const personaEvaluationManifestSchema = z.strictObject({
  generation: z.literal("persona-v2"),
  isolatedFixture: z.literal(true),
  datasetAuthorization: z.enum(["synthetic", "explicitly-authorized"]),
  trials: z.number().int().min(1).max(10).optional(),
  candidate: z.strictObject({
    mcp: z.string().regex(/^[a-f0-9]{40}$/),
    hub: z.string().regex(/^[a-f0-9]{40}$/),
    agent: z.string().regex(/^[a-f0-9]{40}$/),
  }),
  cases: personaEvaluationCasesSchema,
});
