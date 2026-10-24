import { z } from "zod";
import { fixtureSeedsSchema, queryPublicationCaseSchema } from "./publication-fixture.js";
import { federationBudgetSchema } from "./federation-budget-schema.js";
const id = z
  .string()
  .regex(/^[a-z][a-z0-9_]*$/)
  .max(100);
const scalar = z.union([z.string().max(16384), z.number().finite(), z.boolean(), z.null()]);
const columns = z
  .array(id)
  .min(1)
  .max(200)
  .refine((v) => new Set(v).size === v.length);
const local = z.strictObject({
  kind: z.literal("local"),
  id,
  sourceId: z.uuid(),
  publicationId: z.uuid(),
  columns,
});
const join = z.strictObject({
  kind: z.literal("join"),
  id,
  left: id,
  right: id,
  join: z.enum(["inner", "left"]),
  keys: z
    .array(z.strictObject({ left: id, right: id }))
    .min(1)
    .max(16),
  cardinality: z.enum(["one_to_one", "many_to_one", "one_to_many"]),
  columns: z
    .array(z.strictObject({ side: z.enum(["left", "right"]), column: id, as: id }))
    .min(1)
    .max(200),
});
const union = z.strictObject({ kind: z.literal("union"), id, inputs: z.array(id).min(2).max(8) });
const project = z.strictObject({
  kind: z.literal("project"),
  id,
  input: id,
  columns: z
    .array(z.strictObject({ column: id, as: id }))
    .min(1)
    .max(200),
});
const aggregate = z.strictObject({
  kind: z.literal("aggregate"),
  id,
  input: id,
  dimensions: z.array(id).max(200),
  measures: z
    .array(
      z.strictObject({
        operation: z.enum(["count", "sum", "min", "max"]),
        column: id.optional(),
        as: id,
        valueType: z.enum(["scalar", "decimal"]).optional(),
      }),
    )
    .min(1)
    .max(200),
});
const sort = z.strictObject({
  kind: z.literal("sort"),
  id,
  input: id,
  order: z
    .array(
      z.strictObject({
        column: id,
        direction: z.enum(["asc", "desc"]),
        nulls: z.enum(["first", "last"]),
        valueType: z.enum(["scalar", "decimal"]).optional(),
      }),
    )
    .min(1)
    .max(200),
});
const combination = [join, union, project, aggregate, sort] as const;
export const federationTrainingSchema = z.strictObject({
  purpose: z.string().trim().min(1).max(4000),
  semantics: z.strictObject({
    matching: z.string().min(1),
    normalization: z.string().min(1),
    missing: z.string().min(1),
    duplicates: z.string().min(1),
    units: z.string().min(1),
    currency: z.string().min(1),
    calendar: z.string().min(1),
  }),
  steps: z
    .array(z.discriminatedUnion("kind", [local, ...combination]))
    .min(3)
    .max(8),
  output: id,
  budget: federationBudgetSchema.default({}),
});
export const federationPlanSchema = z.strictObject({
  publicationId: z.uuid(),
  steps: z
    .array(
      z.discriminatedUnion("kind", [
        z.strictObject({
          kind: z.literal("local"),
          id,
          sourceId: z.uuid(),
          publicationId: z.uuid(),
          sql: z.string().trim().min(1).max(30000),
          params: z.record(id, scalar),
        }),
        ...combination,
      ]),
    )
    .min(3)
    .max(8),
  output: id,
  page: z.number().int().min(1).max(1000000),
  pageSize: z.number().int().min(1).max(10000),
});
export const federationRequestSchema = z.strictObject({
  plan: federationPlanSchema,
  budget: federationBudgetSchema.optional(),
});

const rows = z
  .array(
    z.record(
      z.string(),
      z.union([z.string().max(16384), z.number().finite(), z.boolean(), z.null()]),
    ),
  )
  .max(5000);
export const federationCaseSchema = z.strictObject({
  name: z.string().min(1),
  input: z.strictObject({
    plan: federationPlanSchema,
    fixtures: z
      .array(
        z.strictObject({
          stepId: z.string(),
          columns: z.array(z.string()),
          rows,
          truncated: z.boolean(),
        }),
      )
      .min(2)
      .max(8),
  }),
  expected: z.union([
    z.strictObject({ rows, columns: z.array(z.string()), totalRows: z.number().int().min(0) }),
    z.strictObject({ errorCode: z.enum(["INVALID_PLAN", "INCOMPLETE_INPUT", "BUDGET_EXCEEDED"]) }),
  ]),
});

export type FederationTraining = z.infer<typeof federationTrainingSchema>;
export type FederationCase = z.infer<typeof federationCaseSchema>;
export const federationPublicationCaseSchema = z.strictObject({
  name: z.string().min(1).max(200),
  input: z.strictObject({
    plan: federationPlanSchema,
    sources: z
      .array(z.strictObject({ sourceId: z.uuid(), fixtures: fixtureSeedsSchema }))
      .min(2)
      .max(4),
  }),
  expected: z.union([
    queryPublicationCaseSchema.shape.expected.safeExtend({
      totalRows: z.number().int().min(0).max(10000),
    }),
    z.strictObject({ errorCode: z.enum(["INVALID_PLAN", "INCOMPLETE_INPUT", "BUDGET_EXCEEDED"]) }),
  ]),
});

export const federationEditableCaseSchema = z.union([
  federationPublicationCaseSchema,
  federationCaseSchema,
]);
export type FederationPublicationCase = z.infer<typeof federationPublicationCaseSchema>;
