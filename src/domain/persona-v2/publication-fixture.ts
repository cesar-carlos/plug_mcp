import { z } from "zod";
import { operationScalarSchema } from "./operation-training.js";
import { datasetCaseOriginSchema } from "./dataset-case-origin.js";

export const fixtureIdentifier = z.string().regex(/^[a-z_][a-z0-9_]{0,62}$/);
export const fixtureTableName = z
  .string()
  .regex(/^(?:[a-z_][a-z0-9_]{0,62}\.)?[a-z_][a-z0-9_]{0,62}$/);
export const fixtureScalarType = z.enum([
  "string",
  "integer",
  "decimal",
  "date",
  "uuid",
  "boolean",
]);
export const fixtureRow = z.record(fixtureIdentifier, operationScalarSchema);
export const fixtureTableSchema = z
  .strictObject({
    table: fixtureTableName,
    columns: z
      .array(
        z.strictObject({
          name: fixtureIdentifier,
          type: fixtureScalarType,
          nullable: z.boolean().default(false),
          generated: z.boolean().default(false),
        }),
      )
      .min(1)
      .max(100),
    primaryKey: z.array(fixtureIdentifier).min(1).max(16),
    uniqueKeys: z.array(z.array(fixtureIdentifier).min(1).max(16)).max(16).default([]),
    foreignKeys: z
      .array(
        z.strictObject({
          columns: z.array(fixtureIdentifier).min(1).max(16),
          targetTable: fixtureTableName,
          targetColumns: z.array(fixtureIdentifier).min(1).max(16),
          onUpdate: z.enum(["no_action", "cascade"]).default("no_action"),
          onDelete: z.enum(["no_action", "cascade"]).default("no_action"),
        }),
      )
      .max(16)
      .default([]),
    insertAudit: z.strictObject({ targetTable: fixtureTableName }).optional(),
    updateAudit: z.strictObject({ targetTable: fixtureTableName }).optional(),
    deleteAudit: z.strictObject({ targetTable: fixtureTableName }).optional(),
    checks: z
      .array(
        z.strictObject({
          kind: z.literal("integer_range"),
          column: fixtureIdentifier,
          min: z.string().regex(/^-?\d{1,19}$/),
          max: z.string().regex(/^-?\d{1,19}$/),
        }),
      )
      .max(16)
      .default([]),
  })
  .superRefine((table, context) => {
    const names = table.columns.map((c) => c.name);
    if (
      new Set(names).size !== names.length ||
      [table.primaryKey, ...table.uniqueKeys].some(
        (key) => new Set(key).size !== key.length || key.some((c) => !names.includes(c)),
      ) ||
      table.columns.some((c) => c.generated && (c.type !== "integer" || c.nullable)) ||
      table.columns.filter((c) => c.generated).length > 1 ||
      table.checks.some(
        (check) =>
          !table.columns.some((c) => c.name === check.column && c.type === "integer") ||
          !/^-?\d{1,19}$/.test(check.min) ||
          !/^-?\d{1,19}$/.test(check.max) ||
          BigInt(check.min) > BigInt(check.max) ||
          BigInt(check.min) < -9223372036854775808n ||
          BigInt(check.max) > 9223372036854775807n,
      ) ||
      table.table.split(".").at(-1) === "se7e_source_identity"
    ) {
      context.addIssue({ code: "custom", message: "Declaração de fixture inválida." });
    }
  });
export const fixtureTablesSchema = z
  .array(fixtureTableSchema)
  .min(1)
  .max(16)
  .superRefine((tables, context) => {
    let valid = new Set(tables.map((t) => t.table)).size === tables.length;
    for (const [index, table] of tables.entries()) {
      for (const fk of table.foreignKeys) {
        const target = tables.slice(0, index).find((t) => t.table === fk.targetTable);
        valid &&=
          !!target &&
          fk.columns.length === fk.targetColumns.length &&
          new Set(fk.columns).size === fk.columns.length &&
          [target.primaryKey, ...target.uniqueKeys].some(
            (key) => key.join("\0") === fk.targetColumns.join("\0"),
          ) &&
          fk.columns.every((name, i) => {
            const column = table.columns.find((c) => c.name === name);
            const remote = target.columns.find((c) => c.name === fk.targetColumns[i]);
            return !!column && !!remote && column.type === remote.type;
          });
      }
      const audits = [table.insertAudit, table.updateAudit, table.deleteAudit].filter(
        (a) => a !== undefined,
      );
      valid &&= new Set(audits.map((a) => a.targetTable)).size === audits.length;
      for (const audit of audits) {
        const target = tables.find((t) => t.table === audit.targetTable);
        valid &&=
          !!target &&
          target !== table &&
          !target.insertAudit &&
          !target.updateAudit &&
          !target.deleteAudit &&
          target.foreignKeys.length === 0 &&
          table.columns.every((c) => !c.generated) &&
          JSON.stringify(table.columns) === JSON.stringify(target.columns);
      }
    }
    if (!valid)
      context.addIssue({
        code: "custom",
        message:
          "FK exige chave anterior compatível; auditoria exige destino separado com colunas idênticas e sem cadeia de triggers.",
      });
  });
export const fixtureSeedsSchema = z
  .array(
    z.strictObject({
      table: fixtureTableName,
      generated: z.array(fixtureIdentifier).default([]),
      rows: z.array(fixtureRow).max(100),
    }),
  )
  .min(1)
  .max(16);
export type PublicationFixtureTable = z.infer<typeof fixtureTableSchema>;
export type PublicationFixtureSeed = z.infer<typeof fixtureSeedsSchema>[number];

export const queryPublicationCaseSchema = z.strictObject({
  name: z.string().min(1).max(200),
  editorialOrigin: datasetCaseOriginSchema.optional(),
  input: z.strictObject({
    sql: z.string().trim().min(1).max(30000).optional(),
    params: z.record(
      fixtureIdentifier,
      z.union([z.string().max(16384), z.number().finite(), z.boolean(), z.null()]),
    ),
    fixtures: fixtureSeedsSchema,
  }),
  expected: z
    .strictObject({
      columns: z
        .array(z.strictObject({ name: fixtureIdentifier, type: fixtureScalarType }))
        .min(1)
        .max(100),
      rows: z.array(fixtureRow).max(100),
      ordered: z.boolean(),
    })
    .superRefine((expected, context) => {
      const names = expected.columns.map((c) => c.name);
      if (
        new Set(names).size !== names.length ||
        expected.rows.some(
          (row) =>
            Object.keys(row).length !== names.length ||
            expected.columns.some(
              (c) => !row[c.name] || (row[c.name]!.type !== c.type && row[c.name]!.type !== "null"),
            ),
        )
      ) {
        context.addIssue({
          code: "custom",
          message: "Resultado esperado incompleto ou incompatível.",
        });
      }
    }),
});
export type QueryPublicationCase = z.infer<typeof queryPublicationCaseSchema>;
