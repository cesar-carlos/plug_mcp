import { z } from "zod";
import type { Source } from "./model.js";
import {
  knowledgeSelectionSchema,
  trainedRelationshipSchema,
  type AdoptedKnowledge,
} from "./knowledge-adoption.js";
const name = z
  .string()
  .regex(/^[a-z_][a-z0-9_]*$/)
  .max(100);
const text = z.string().trim().min(1).max(5000);
export const operationTableNameSchema = z
  .string()
  .regex(/^(?:[a-z_][a-z0-9_]{0,99}\.)?[a-z_][a-z0-9_]{0,99}$/)
  .max(200);
const tableName = operationTableNameSchema;
export const operationScalarSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("string"), value: z.string().max(65536) }),
  z.strictObject({
    type: z.literal("integer"),
    value: z
      .string()
      .regex(/^-?\d+$/)
      .max(20)
      .refine((v) => BigInt(v) >= -(2n ** 63n) && BigInt(v) < 2n ** 63n),
  }),
  z.strictObject({
    type: z.literal("decimal"),
    value: z
      .string()
      .regex(/^-?\d+(\.\d+)?$/)
      .max(128),
  }),
  z.strictObject({
    type: z.literal("date"),
    value: z.union([
      z.iso.date(),
      z.iso.datetime({ offset: true, precision: 3 }),
      z.iso.datetime({ offset: true, precision: 0 }),
    ]),
  }),
  z.strictObject({ type: z.literal("uuid"), value: z.uuid() }),
  z.strictObject({ type: z.literal("boolean"), value: z.boolean() }),
  z.strictObject({ type: z.literal("null"), value: z.null() }),
]);
const scalarType = z.enum(["string", "integer", "decimal", "date", "uuid", "boolean"]);
const binding = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("input"), name }),
  z.strictObject({ kind: z.literal("step_output"), stepId: name, output: name }),
  z.strictObject({ kind: z.literal("operation_id") }),
]);
const bounds = z
  .strictObject({ min: z.number().int().min(0), max: z.number().int().min(0).max(100000) })
  .refine((r) => r.min <= r.max);
const field = z.strictObject({ column: name, binding });
const step = z.strictObject({
  id: name,
  effect: z.enum(["select", "insert", "update", "delete"]),
  table: tableName,
  values: z.array(field).max(100),
  where: z.array(field).max(100),
  outputs: z.array(z.strictObject({ column: name, type: scalarType })).max(32),
  rows: bounds,
  /** Optional predicates may only narrow the mandatory WHERE using AND. */
  adaptiveFilters: z
    .array(
      z.strictObject({
        column: name,
        operator: z.enum(["=", "<>", ">", ">=", "<", "<="]),
        parameter: name,
      }),
    )
    .max(32)
    .optional(),
});
/** Closed declarative contract. Consumer SQL adaptations must preserve its mandatory clauses. */
export const operationTrainingSchema = z.strictObject({
  sharedKnowledge: knowledgeSelectionSchema.optional(),
  relationships: z.array(trainedRelationshipSchema).max(128).optional(),
  sourceId: z.uuid(),
  dialect: z.enum(["postgres", "mssql", "sybase"]),
  purpose: text,
  mode: z.enum(["somente_parametros", "sql_adaptavel"]),
  approval: z.enum(["human", "automatic"]).default("human"),
  parameters: z
    .array(z.strictObject({ name, type: scalarType, nullable: z.boolean(), meaning: text }))
    .max(100),
  tables: z
    .array(
      z.strictObject({
        name: tableName,
        meaning: text,
        /** Explicit business grain; mandatory for shared knowledge adoption. */
        grain: z.array(name).min(1).max(32).optional(),
        identity: z.array(name).min(1).max(16),
        concurrency: z.array(name).max(16),
        /** Confirmed physical UNIQUE keys used for SQL Anywhere post-write reads. */
        uniqueKeys: z.array(z.array(name).min(1).max(16)).max(16).optional(),
        columns: z
          .array(
            z.strictObject({
              name,
              type: scalarType,
              writable: z.boolean(),
              meaning: text,
              classification: z
                .enum(["livre", "sensivel", "pessoal", "segredo", "inferido"])
                .optional(),
            }),
          )
          .min(1)
          .max(200),
      }),
    )
    .min(1)
    .max(32),
  steps: z.array(step).min(1).max(32),
  maxAffectedRows: z.number().int().positive().max(100000),
  timeoutMs: z.number().int().positive().max(300000),
  rules: z.array(text).max(100),
  indirectEffects: text,
  reconciliation: text,
  reconciliationQuery: z
    .strictObject({
      table: tableName,
      operationIdColumn: name,
      /** The marker is inserted in the same transaction, unique and append-only. */
      appendOnlyGuarantee: text,
    })
    .optional(),
});
export type OperationTraining = z.infer<typeof operationTrainingSchema>;
export interface OperationPackage {
  readonly sharedKnowledge?: AdoptedKnowledge;
  readonly format: "persona-sql-operation-v2";
  readonly name: string;
  readonly purpose: string;
  readonly sourceId: string;
  readonly sourceFingerprint: string;
  readonly dialect: Source["dialect"];
  readonly training: OperationTraining;
  readonly commonTraining: {
    readonly version: string;
    readonly hash: string;
    readonly hubContractRef: string;
  };
  readonly requiredCapabilities: readonly string[];
}
