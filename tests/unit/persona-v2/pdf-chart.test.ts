import { expect, it } from "vitest";
import { renderPdfReport } from "../../../src/infrastructure/persona-v2/pdf-renderer.js";
import { generatedPdfContractSchema } from "../../../src/domain/persona-v2/pdf-report.js";
import type { PdfRenderInput } from "../../../src/domain/ports/persona-pdf-renderer.port.js";

const input: PdfRenderInput = {
  orientation: "portrait",
  columns: ["produto", "valor"],
  rows: [
    ["Açúcar", "123.4500"],
    ["Café", "40.01"],
  ],
  readAt: "2026-11-20T12:00:00Z",
  complete: false,
  maxPages: 10,
  maxBytes: 1048576,
};
it.each(["bar", "line", "pie"] as const)(
  "renders %s and the equivalent table from one capture",
  async (kind) => {
    const pdf = await renderPdfReport({
      ...input,
      chart: { kind, categoryIndex: 0, valueIndex: 1, unit: "BRL" },
    });
    expect(pdf.pages).toBe(2);
    expect(Buffer.from(pdf.data).toString("latin1")).toContain("/Subtype /Image");
  },
);
it("preserves missing values for lines and refuses invalid composition, duplicate labels and nonnumeric text", async () => {
  const chart = { kind: "line" as const, categoryIndex: 0, valueIndex: 1, unit: "BRL" as const };
  expect(
    (
      await renderPdfReport({
        ...input,
        chart,
        rows: [
          ["A", null],
          ["B", "1.00"],
        ],
      })
    ).pages,
  ).toBe(2);
  for (const rows of [
    [["A", null]],
    [["A", "-1"]],
    [["A", "0"]],
    [
      ["A", "1"],
      ["A", "2"],
    ],
    [["A", "NaN"]],
    [["A", "1e100"]],
    [["A", "Não informado"]],
  ] as PdfRenderInput["rows"][]) {
    await expect(
      renderPdfReport({ ...input, rows, chart: { ...chart, kind: "pie" } }),
    ).rejects.toThrow("PDF_INPUT_INVALID");
  }
  await expect(renderPdfReport({ ...input, chart, maxPages: 1 })).rejects.toThrow(
    "PDF_PAGES_EXCEEDED",
  );
});
it("requires published chart fields, unique identity and closed options", () => {
  const contract = {
    schemaVersion: 1,
    templates: ["table-v1"],
    columns: ["produto", "valor"],
    maxRows: 30,
    maxPages: 10,
    maxBytes: 1048576,
    ttlMs: 60000,
  };
  const chart = { id: "vendas", kind: "bar", category: "produto", value: "valor", unit: "BRL" };
  expect(generatedPdfContractSchema.safeParse({ ...contract, charts: [chart] }).success).toBe(true);
  expect(
    generatedPdfContractSchema.safeParse({ ...contract, charts: [chart, chart] }).success,
  ).toBe(false);
  expect(
    generatedPdfContractSchema.safeParse({ ...contract, charts: [{ ...chart, value: "privado" }] })
      .success,
  ).toBe(false);
  expect(
    generatedPdfContractSchema.safeParse({ ...contract, charts: [{ ...chart, formatter: "code" }] })
      .success,
  ).toBe(false);
});
