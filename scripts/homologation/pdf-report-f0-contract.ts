/** F0 draft only. Not registered in MCP, publication schemas or runtime. */
import { z } from "zod";
import { sourceQuerySchema } from "../../src/application/persona-v2/source-query.js";

export const pdfReportF0Schema = z
  .strictObject({
    schemaVersion: z.literal(1),
    requestId: z.uuid(),
    query: sourceQuerySchema.extend({
      fonteId: z.uuid(),
      skillIds: z.array(z.uuid()).length(1),
    }),
    scope: z.enum(["pagina", "limitado", "integral"]),
    layout: z.strictObject({
      templateId: z.literal("table-v1"),
      orientation: z.enum(["portrait", "landscape"]),
      columns: z
        .array(
          z
            .string()
            .regex(/^[a-z_][a-z0-9_$]*$/)
            .max(100),
        )
        .min(1)
        .max(8)
        .refine((columns) => new Set(columns).size === columns.length),
    }),
  })
  .superRefine((request, ctx) => {
    if ((request.scope === "pagina") !== (request.query.options?.page !== undefined)) {
      ctx.addIssue({
        code: "custom",
        path: ["scope"],
        message: "Página SQL apenas no escopo pagina.",
      });
    }
  });

export const pdfReportJobF0Schema = z.strictObject({ jobId: z.uuid() });

export const generatedPdfF0Schema = z.strictObject({
  schemaVersion: z.literal(1),
  templates: z.tuple([z.literal("table-v1")]),
  columns: z
    .array(
      z
        .string()
        .regex(/^[a-z_][a-z0-9_$]*$/)
        .max(100),
    )
    .min(1)
    .max(8)
    .refine((columns) => new Set(columns).size === columns.length),
  maxRows: z.number().int().min(1).max(5000),
  maxPages: z.number().int().min(1).max(250),
  maxBytes: z
    .number()
    .int()
    .min(1)
    .max(8 * 1024 * 1024),
  ttlMs: z
    .number()
    .int()
    .min(1)
    .max(15 * 60 * 1000),
});

const statusBase = z.strictObject({
  jobId: z.uuid(),
  workDeadline: z.iso.datetime(),
  artifactExpiresAt: z.iso.datetime(),
  replayAllowed: z.literal(false),
});
export const pdfReportStatusF0Schema = z.discriminatedUnion("state", [
  statusBase.extend({
    state: z.enum(["accepted", "validating", "collecting", "captured", "rendering"]),
  }),
  statusBase.extend({
    state: z.literal("ready"),
    handle: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    format: z.literal("pdf"),
    mimeType: z.literal("application/pdf"),
    complete: z.boolean(),
    consistency: z.literal("not_asserted"),
    rows: z.number().int().min(0).max(5000),
    pages: z.number().int().min(1).max(250),
    bytes: z
      .number()
      .int()
      .min(1)
      .max(8 * 1024 * 1024),
  }),
  statusBase.extend({
    state: z.enum(["failed", "capture_unconfirmed", "cancelled", "expired"]),
    reason: z.enum([
      "validation",
      "authorization",
      "capture_unconfirmed",
      "incomplete",
      "budget",
      "render",
      "cancelled",
      "expired",
    ]),
    supportId: z.uuid(),
  }),
]);

/** Fixed-scale fixture formatting, never convert monetary data to binary float. */
export function syntheticMoney(cents: bigint | null): string {
  if (cents === null) return "Não informado";
  const sign = cents < 0n ? "-" : "";
  const absolute = cents < 0n ? -cents : cents;
  return `${sign}${absolute / 100n},${String(absolute % 100n).padStart(2, "0")}`;
}
