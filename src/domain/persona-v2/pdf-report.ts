import { z } from "zod";
import { attachmentContractSchema } from "./attachments.js";
import { pdfCellFormatSchema } from "./pdf-format.js";

export const pdfReportColumnsSchema = z
  .array(
    z
      .string()
      .regex(/^[a-z_][a-z0-9_$]*$/)
      .max(100),
  )
  .min(1)
  .max(8)
  .refine((columns) => new Set(columns).size === columns.length);
/** Published authority for generated documents, independent from JSON and BLOB exports. */
export const generatedPdfContractSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    templates: z.tuple([z.literal("table-v1")]),
    columns: pdfReportColumnsSchema,
    columnFormats: z.record(z.string().max(100), pdfCellFormatSchema).optional(),
    maxRows: z.number().int().min(1).max(5000),
    maxPages: z.number().int().min(1).max(250),
    maxBytes: attachmentContractSchema.shape.maxBytes,
    ttlMs: attachmentContractSchema.shape.ttlMs,
    successiveSections: z.number().int().min(2).max(4).optional(),
    charts: z
      .array(
        z.strictObject({
          id: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),
          kind: z.enum(["bar", "line", "pie"]),
          category: z
            .string()
            .regex(/^[a-z_][a-z0-9_$]*$/)
            .max(100),
          value: z
            .string()
            .regex(/^[a-z_][a-z0-9_$]*$/)
            .max(100),
          unit: z.enum(["BRL", "quantity", "percent"]),
        }),
      )
      .min(1)
      .max(3)
      .optional(),
  })
  .superRefine((contract, ctx) => {
    if (
      Object.keys(contract.columnFormats ?? {}).some((column) => !contract.columns.includes(column))
    )
      ctx.addIssue({ code: "custom", message: "Formato exige coluna exportável declarada." });
    const ids = new Set<string>();
    for (const chart of contract.charts ?? []) {
      const expectedFormat =
        chart.unit === "BRL" ? "currency" : chart.unit === "percent" ? "percent" : "number";
      if (
        contract.columnFormats?.[chart.value] !== undefined &&
        contract.columnFormats[chart.value] !== expectedFormat
      )
        ctx.addIssue({
          code: "custom",
          message: "Formato da medida deve corresponder à unidade do gráfico.",
        });
      if (
        ids.has(chart.id) ||
        chart.category === chart.value ||
        !contract.columns.includes(chart.category) ||
        !contract.columns.includes(chart.value)
      ) {
        ctx.addIssue({
          code: "custom",
          message: "Gráfico exige identidade única e colunas distintas exportáveis.",
        });
      }
      ids.add(chart.id);
    }
  });
export type GeneratedPdfContract = z.infer<typeof generatedPdfContractSchema>;
