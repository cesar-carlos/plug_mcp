import { expect, it } from "vitest";
import {
  brazilianDecimal,
  brazilianDate,
  formatPdfCell,
} from "../../../src/domain/persona-v2/pdf-format.js";
import { generatedPdfContractSchema } from "../../../src/domain/persona-v2/pdf-report.js";

it.each([
  ["1234.5", "1.234,50"],
  ["1.005", "1,01"],
  ["-1.005", "-1,01"],
  ["999.995", "1.000,00"],
  ["-0.001", "0,00"],
  ["0", "0,00"],
  ["9007199254740993.125", "9.007.199.254.740.993,13"],
])("formats %s exactly in base ten", (raw, expected) =>
  expect(brazilianDecimal(raw)).toBe(expected),
);
it("preserves identifiers, null and percentage scale", () => {
  expect(formatPdfCell("000123")).toBe("000123");
  expect(formatPdfCell(null, "number")).toBe("Não informado");
  expect(formatPdfCell("1234.56", "currency")).toBe("R$ 1.234,56");
  expect(formatPdfCell("12.5", "percent")).toBe("12,50%");
  expect(formatPdfCell("true", "boolean")).toBe("Sim");
  expect(formatPdfCell("false", "boolean")).toBe("Não");
});
it("formats dates without shifting calendar days or inventing timezone", () => {
  expect(brazilianDate("2024-02-29")).toBe("29/02/2024");
  expect(brazilianDate("2026-11-20T00:10:20.123Z", true)).toBe("20/11/2026 00:10:20,123 UTC");
  expect(brazilianDate("2026-11-20T00:10:20-04:00", true)).toBe("20/11/2026 00:10:20 UTC-04:00");
  expect(brazilianDate("2026-11-20 00:10:20", true)).toContain("sem fuso informado");
});
it("rejects invalid typed values without ambiguous guessing", () => {
  for (const raw of ["1,25", "1e3", "NaN", "Infinity", "1.2.3"])
    expect(() => brazilianDecimal(raw)).toThrow("PDF_INPUT_INVALID");
  for (const raw of ["2026-02-29", "2026-13-01", "2026-04-31"])
    expect(() => brazilianDate(raw)).toThrow("PDF_INPUT_INVALID");
  expect(() => brazilianDate("2026-11-20T24:00:00Z", true)).toThrow("PDF_INPUT_INVALID");
});
it("binds formats to exported columns, with no free formatter code", () => {
  const contract = {
    schemaVersion: 1,
    templates: ["table-v1"],
    columns: ["valor"],
    maxRows: 10,
    maxPages: 2,
    maxBytes: 1024,
    ttlMs: 60000,
  };
  expect(
    generatedPdfContractSchema.safeParse({ ...contract, columnFormats: { valor: "currency" } })
      .success,
  ).toBe(true);
  expect(
    generatedPdfContractSchema.safeParse({ ...contract, columnFormats: { segredo: "text" } })
      .success,
  ).toBe(false);
  expect(
    generatedPdfContractSchema.safeParse({ ...contract, columnFormats: { valor: "javascript" } })
      .success,
  ).toBe(false);
});

it("rejects chart unit and table format contradictions", () => {
  const base = {
    schemaVersion: 1,
    templates: ["table-v1"],
    columns: ["id", "valor"],
    maxRows: 10,
    maxPages: 2,
    maxBytes: 1024,
    ttlMs: 60000,
    charts: [{ id: "amounts", kind: "bar", category: "id", value: "valor", unit: "BRL" }],
  };
  expect(
    generatedPdfContractSchema.safeParse({ ...base, columnFormats: { valor: "percent" } }).success,
  ).toBe(false);
  expect(
    generatedPdfContractSchema.safeParse({ ...base, columnFormats: { valor: "currency" } }).success,
  ).toBe(true);
  expect(generatedPdfContractSchema.safeParse(base).success).toBe(true);
});
