import { z } from "zod";

const id = z
  .string()
  .regex(/^[a-z][a-z0-9_-]*$/)
  .max(100);
const identifier = z
  .string()
  .regex(/^[a-z_][a-z0-9_$]*(\.[a-z_][a-z0-9_$]*)?$/)
  .max(200);
const column = z
  .string()
  .regex(/^[a-z_][a-z0-9_$]*$/)
  .max(100);
const text = z.string().trim().min(1).max(5000);
const dialect = z.enum(["postgres", "mssql", "sybase"]);
const constraintStatus = z.enum(["enabled", "disabled", "unvalidated", "unknown"]);
export const structureContentSchema = z.strictObject({
  system: z.string().trim().min(1).max(200),
  label: z.string().trim().min(1).max(100),
  dialects: z.array(dialect).min(1).max(4),
  tables: z
    .array(
      z.strictObject({
        id,
        name: identifier,
        meaning: text,
        resourceType: z.enum(["table", "view"]),
        grain: z.array(column).min(1).max(32),
        physicalNames: z.array(z.strictObject({ dialect, name: identifier })).max(4),
        keys: z
          .array(
            z.strictObject({
              id,
              kind: z.enum(["primary", "unique"]),
              columns: z.array(column).min(1).max(32),
              status: constraintStatus,
            }),
          )
          .max(64)
          .optional(),
        columns: z
          .array(
            z.strictObject({
              name: column,
              meaning: text,
              logicalType: z.string().trim().min(1).max(100),
              nullable: z.boolean(),
              classification: z.enum(["livre", "sensivel", "pessoal", "segredo", "inferido"]),
              nativeTypes: z
                .array(
                  z.strictObject({
                    dialect,
                    type: z.string().trim().min(1).max(100),
                    precision: z.number().int().positive().max(1000).optional(),
                    scale: z.number().int().min(0).max(1000).optional(),
                    length: z.number().int().positive().max(2147483647).optional(),
                  }),
                )
                .max(4)
                .optional(),
              unit: text.optional(),
              currency: text.optional(),
              calendar: text.optional(),
            }),
          )
          .min(1)
          .max(1024),
      }),
    )
    .min(1)
    .max(64),
  relationships: z
    .array(
      z.strictObject({
        id,
        from: id,
        to: id,
        keys: z
          .array(z.strictObject({ from: column, to: column }))
          .min(1)
          .max(16),
        join: z.enum(["inner", "left"]),
        cardinality: z.enum(["1:1", "1:N", "N:1", "N:N"]),
        optional: z.boolean(),
        meaning: text,
        via: z.array(id).max(8),
        path: z.array(id).max(9).optional(),
        origin: z.enum(["database", "business"]).optional(),
        constraintName: identifier.optional(),
        constraintStatus: constraintStatus.optional(),
      }),
    )
    .max(128),
  examples: z
    .array(
      z.strictObject({
        id,
        purpose: text,
        explanation: text,
        state: z.enum(["candidate", "approved", "inactive", "replaced"]),
        variants: z
          .array(
            z.strictObject({
              dialect,
              sql: z.string().min(1).max(30000),
              parameters: z
                .array(
                  z.strictObject({
                    name: column,
                    type: z.enum([
                      "string",
                      "number",
                      "integer",
                      "decimal",
                      "boolean",
                      "date",
                      "datetime",
                    ]),
                    required: z.boolean(),
                    meaning: text,
                  }),
                )
                .max(100),
            }),
          )
          .min(1)
          .max(4),
      }),
    )
    .max(100),
  rules: z.array(text).max(100),
});
