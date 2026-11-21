import { expect, it, vi } from "vitest";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import {
  pdfRenderInputSchema,
  renderPdfReport,
} from "../../../src/infrastructure/persona-v2/pdf-renderer.js";
const input = {
  orientation: "portrait" as const,
  columns: ["Código", "Valor"],
  rows: [["1", "123.45"]],
  readAt: "2026-11-20T12:00:00Z",
  complete: false,
  maxPages: 10,
  maxBytes: 1048576,
};
it("renders bounded fixed-template PDF and refuses page/byte overflow", async () => {
  const rendered = await renderPdfReport(input);
  expect(Buffer.from(rendered.data).subarray(0, 5).toString()).toBe("%PDF-");
  expect(rendered.pages).toBe(1);
  await expect(renderPdfReport({ ...input, maxBytes: 10 })).rejects.toThrow("PDF_BYTES_EXCEEDED");
  await expect(
    renderPdfReport({ ...input, maxPages: 1, rows: Array.from({ length: 100 }, () => ["1", "2"]) }),
  ).rejects.toThrow("PDF_PAGES_EXCEEDED");
});
it("rejects tall cells instead of silently clipping, and rejects free renderer options", async () => {
  await expect(renderPdfReport({ ...input, rows: [["long\n".repeat(100), "1"]] })).rejects.toThrow(
    "PDF_CELL_TOO_TALL",
  );
  expect(pdfRenderInputSchema.safeParse({ ...input, url: "https://example.test" }).success).toBe(
    false,
  );
  expect(pdfRenderInputSchema.safeParse({ ...input, rows: [["1"]] }).success).toBe(false);
  expect(pdfRenderInputSchema.safeParse({ ...input, rows: [["\u202eprivate", "1"]] }).success).toBe(
    false,
  );
  expect(pdfRenderInputSchema.safeParse({ ...input, rows: [["東京", "1"]] }).success).toBe(false);
  expect(pdfRenderInputSchema.safeParse({ ...input, rows: [["Açúcar — €", "1"]] }).success).toBe(
    true,
  );
});

it("embeds regular and bold fonts with Unicode mappings for portable report text", async () => {
  const rendered = await renderPdfReport({ ...input, rows: [["Açúcar — € Šžƒ", "123.45"]] });
  const pdf = Buffer.from(rendered.data).toString("latin1");
  expect(pdf).toContain("NotoSans-Regular");
  expect(pdf).toContain("NotoSans-Bold");
  expect(pdf.match(/\/FontFile2\b/g)).toHaveLength(2);
  expect(pdf.match(/\/ToUnicode\b/g)).toHaveLength(2);
  expect(pdf).not.toContain("/BaseFont /Helvetica");
});

it("allocates description width instead of exhausting the page budget on narrow equal columns", async () => {
  const rendered = await renderPdfReport({
    ...input,
    columns: ["Código", "Descrição", "Valor (BRL)"],
    maxPages: 250,
    maxBytes: 8388608,
    rows: Array.from({ length: 5000 }, (_, i) => [
      `ID${String(i + 1).padStart(6, "0")}`,
      `Produto sintético ${i + 1} — açúcar e café${i % 17 === 0 ? "\nSegunda linha preservada." : ""}`,
      "123.45",
    ]),
  });
  expect(rendered.pages).toBeGreaterThan(1);
  expect(rendered.pages).toBeLessThanOrEqual(250);
});

it("does not reopen embedded TTF files for each table cell", async () => {
  const read = vi.spyOn(fs, "readFileSync");
  syncBuiltinESMExports();
  try {
    await renderPdfReport({
      ...input,
      rows: Array.from({ length: 100 }, (_, i) => [String(i), "10.25"]),
    });
    const fontReads = read.mock.calls.filter(([path]) => String(path).endsWith(".ttf"));
    expect(fontReads).toHaveLength(2);
  } finally {
    read.mockRestore();
    syncBuiltinESMExports();
  }
});

it("renders bounded sections with different orientations and keeps a global page budget", async () => {
  const section = {
    orientation: "landscape" as const,
    columns: ["Código", "Valor"],
    rows: [["2", "10.00"]],
    readAt: "2026-11-20T12:01:00Z",
    complete: true,
  };
  expect((await renderPdfReport({ ...input, additionalSections: [section] })).pages).toBe(2);
  await expect(
    renderPdfReport({ ...input, maxPages: 1, additionalSections: [section] }),
  ).rejects.toThrow("PDF_PAGES_EXCEEDED");
  expect(
    pdfRenderInputSchema.safeParse({
      ...input,
      additionalSections: Array.from({ length: 4 }, () => section),
    }).success,
  ).toBe(false);
});
