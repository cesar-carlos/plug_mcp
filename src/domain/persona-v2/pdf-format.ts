import { z } from "zod";

export const pdfCellFormatSchema = z.enum([
  "text",
  "number",
  "currency",
  "percent",
  "date",
  "datetime",
  "boolean",
]);
export type PdfCellFormat = z.infer<typeof pdfCellFormatSchema>;

/** Decimal rounding in base ten; never convert financial strings through Number. */
export function brazilianDecimal(raw: string): string {
  if (!/^-?\d{1,100}(?:\.\d{1,100})?$/.test(raw)) throw new Error("PDF_INPUT_INVALID");
  const negative = raw.startsWith("-");
  const [whole, fraction = ""] = raw.replace(/^-/, "").split(".");
  let cents = BigInt(whole!) * 100n + BigInt((fraction + "00").slice(0, 2));
  if ((fraction[2] ?? "0") >= "5") cents++;
  const integer = (cents / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negative && cents !== 0n ? "-" : ""}${integer},${(cents % 100n).toString().padStart(2, "0")}`;
}

export function brazilianDate(raw: string, timestamp = false): string {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}):(\d{2})(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})?)?$/.exec(
      raw,
    );
  if (!match || Boolean(match[4]) !== timestamp) throw new Error("PDF_INPUT_INVALID");
  const [, year, month, day, hour, minute, second, fraction, zone] = match;
  const parsed = new Date(`${year}-${month}-${day}T00:00:00Z`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== raw.slice(0, 10) ||
    (timestamp && (Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59)) ||
    (zone && zone !== "Z" && (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(4)) > 59))
  )
    throw new Error("PDF_INPUT_INVALID");
  return `${day}/${month}/${year}${timestamp ? ` ${hour}:${minute}:${second}${fraction ? fraction.replace(".", ",") : ""}${zone === "Z" ? " UTC" : zone ? ` UTC${zone}` : " (sem fuso informado)"}` : ""}`;
}

export function formatPdfCell(value: string | null, format: PdfCellFormat = "text"): string {
  if (value === null) return "Não informado";
  if (format === "number") return brazilianDecimal(value);
  if (format === "currency") return `R$ ${brazilianDecimal(value)}`;
  // Percentage values are already in percentage points; no implicit multiplication.
  if (format === "percent") return `${brazilianDecimal(value)}%`;
  if (format === "date" || format === "datetime")
    return brazilianDate(value, format === "datetime");
  if (format === "boolean") {
    if (value !== "true" && value !== "false") throw new Error("PDF_INPUT_INVALID");
    return value === "true" ? "Sim" : "Não";
  }
  return value;
}
