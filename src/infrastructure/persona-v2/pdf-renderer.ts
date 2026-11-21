import PDFDocument from "pdfkit";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { PdfRenderInput } from "../../domain/ports/persona-pdf-renderer.port.js";
import { renderPdfChart } from "./pdf-chart.js";
import {
  pdfCellFormatSchema,
  formatPdfCell,
  brazilianDate,
} from "../../domain/persona-v2/pdf-format.js";

const regularFont = fileURLToPath(
  new URL("../../../assets/pdf-fonts/NotoSans-Regular.ttf", import.meta.url),
);
const boldFont = fileURLToPath(
  new URL("../../../assets/pdf-fonts/NotoSans-Bold.ttf", import.meta.url),
);

// Keep the reviewed character repertoire. Embedded fonts never authorize arbitrary text.
const printable = z
  .string()
  .max(2000)
  .regex(
    /^[\t\n\r\u0020-\u007e\u00a0-\u00ff\u0152\u0153\u0160\u0161\u0178\u017d\u017e\u0192\u02c6\u02dc\u2013-\u2014\u2018-\u201a\u201c-\u201e\u2020-\u2022\u2026\u2030\u2039\u203a\u20ac]*$/u,
  );
const basePdfRenderSchema = z.strictObject({
  orientation: z.enum(["portrait", "landscape"]),
  columns: z.array(printable.max(100)).min(1).max(8),
  formats: z.array(pdfCellFormatSchema).min(1).max(8).optional(),
  rows: z.array(z.array(printable.nullable()).min(1).max(8)).max(5000),
  chart: z
    .strictObject({
      kind: z.enum(["bar", "line", "pie"]),
      categoryIndex: z.number().int().min(0).max(7),
      valueIndex: z.number().int().min(0).max(7),
      unit: z.enum(["BRL", "quantity", "percent"]),
    })
    .optional(),
  readAt: z.iso.datetime(),
  sourceId: z.uuid().optional(),
  complete: z.boolean(),
  maxPages: z.number().int().min(1).max(250),
  maxBytes: z
    .number()
    .int()
    .min(1)
    .max(8 * 1024 * 1024),
});
export const pdfRenderInputSchema = basePdfRenderSchema
  .extend({
    additionalSections: z
      .array(basePdfRenderSchema.omit({ maxPages: true, maxBytes: true }))
      .min(1)
      .max(3)
      .optional(),
  })
  .refine((input) => {
    const sections = [input, ...(input.additionalSections ?? [])];
    return (
      sections.every(
        (section) =>
          (!section.formats || section.formats.length === section.columns.length) &&
          section.rows.every((row) => row.length === section.columns.length),
      ) && sections.reduce((total, section) => total + section.rows.length, 0) <= 5000
    );
  });

/** Pure fixed-template renderer. The caller must run it in the isolated renderer service. */
export async function renderPdfReport(
  raw: PdfRenderInput,
): Promise<{ data: Uint8Array; pages: number }> {
  const documentInput = pdfRenderInputSchema.parse(raw);
  const inputs = [
    documentInput,
    ...(documentInput.additionalSections ?? []).map((section) => ({
      ...section,
      maxPages: documentInput.maxPages,
      maxBytes: documentInput.maxBytes,
    })),
  ];
  const doc = new PDFDocument({
    autoFirstPage: false,
    bufferPages: false,
    compress: true,
    info: { Title: "Relatório de consulta", Author: "Se7e MCP" },
  });
  let bytes = 0;
  const chunks: Buffer[] = [];
  const output = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > documentInput.maxBytes) doc.destroy(new Error("PDF_BYTES_EXCEEDED"));
      else chunks.push(chunk);
    });
    doc.once("error", reject);
    doc.once("end", () => resolve(Buffer.concat(chunks)));
  });
  // Observe stream failures even when planning rejects before awaiting output.
  void output.catch(() => undefined);
  try {
    doc.addPage({ size: "A4", layout: documentInput.orientation, margin: 36 });
    const plans = [];
    for (const input of inputs) {
      const displayRows = input.rows.map((row) =>
        row.map((cell, index) =>
          formatPdfCell(
            cell,
            input.formats?.[index] ??
              (input.chart?.valueIndex === index
                ? input.chart.unit === "BRL"
                  ? "currency"
                  : input.chart.unit === "percent"
                    ? "percent"
                    : "number"
                : "text"),
          ),
        ),
      );
      const landscape = input.orientation === "landscape";
      const width = landscape ? 841.89 : 595.28,
        height = landscape ? 595.28 : 841.89;
      const chartImage = input.chart
        ? await renderPdfChart(input, width - 72, height - 220)
        : undefined;
      // PDFKit tables restore the font by source path. Using that same cache key
      // avoids reopening a registered alias's TTF for every cell restoration.
      doc.font(regularFont).fontSize(9);
      // Size from a bounded sample, then wrap every row with the same measured widths.
      // Short identifiers should not consume the same space as descriptions.
      const desired = input.columns.map((name, index) =>
        Math.max(
          48,
          Math.min(
            320,
            ...[name, ...displayRows.slice(0, 100).map((row) => row[index]!)]
              .flatMap((text) => text.split(/\r?\n/))
              .map((line) => doc.widthOfString(line) + 14),
          ),
        ),
      );
      const sumDesired = desired.reduce((sum, value) => sum + value, 0);
      const colWidths = desired.map((value) => (value / sumDesired) * (width - 72));
      const headerHeight = Math.max(
        28,
        ...input.columns.map(
          (name, index) => doc.heightOfString(name, { width: colWidths[index]! - 12 }) + 14,
        ),
      );
      const available = height - 200;
      const pages: { rows: string[][]; heights: number[] }[] = [{ rows: [], heights: [] }];
      let used = headerHeight;
      for (const rawRow of displayRows) {
        const row = rawRow.map((cell) => cell ?? "Não informado");
        const rowHeight = Math.max(
          22,
          ...row.map(
            (cell, index) => doc.heightOfString(cell, { width: colWidths[index]! - 12 }) + 14,
          ),
        );
        if (rowHeight + headerHeight > available) throw new Error("PDF_CELL_TOO_TALL");
        if (used + rowHeight > available) {
          pages.push({ rows: [], heights: [] });
          used = headerHeight;
        }
        if (pages.length + (chartImage ? 1 : 0) > input.maxPages)
          throw new Error("PDF_PAGES_EXCEEDED");
        pages.at(-1)!.rows.push([...row]);
        pages.at(-1)!.heights.push(rowHeight);
        used += rowHeight;
      }
      plans.push({ input, landscape, width, height, chartImage, pages, colWidths, headerHeight });
    }
    let actualPages = 1;
    doc.on("pageAdded", () => {
      actualPages++;
    });
    const totalPages = plans.reduce(
      (total, plan) => total + plan.pages.length + (plan.chartImage ? 1 : 0),
      0,
    );
    if (totalPages > documentInput.maxPages) throw new Error("PDF_PAGES_EXCEEDED");
    let pageNumber = 0;
    for (const [sectionIndex, plan] of plans.entries()) {
      const { input, landscape, width, height, chartImage, pages, colWidths, headerHeight } = plan;
      const addPage = () =>
        doc.addPage({ size: "A4", layout: landscape ? "landscape" : "portrait", margin: 36 });
      const titlePrefix = plans.length > 1 ? `Seção ${sectionIndex + 1}/${plans.length} — ` : "";
      if (chartImage) {
        if (pageNumber) addPage();
        doc.font(boldFont).fontSize(16).text(`${titlePrefix}Gráfico da consulta`, 36, 32);
        doc
          .font(regularFont)
          .fontSize(9)
          .text(
            plans.length > 1
              ? `${input.complete ? "Completo" : "PARCIAL"}: leituras sucessivas; sem snapshot comum.`
              : input.complete
                ? "Consulta completa; snapshot não comprovado."
                : "PARCIAL: somente o recorte solicitado.",
            36,
            60,
          );
        doc.text(
          `Leitura: ${brazilianDate(input.readAt, true)} | Unidade: ${input.chart!.unit === "BRL" ? "R$" : input.chart!.unit === "percent" ? "%" : "Quantidade"}${input.sourceId ? ` | Fonte: ${input.sourceId}` : ""}`,
          36,
          78,
        );
        doc.image(chartImage, 36, 104, { width: width - 72 });
        doc.text(
          "Valores exibidos com duas casas decimais; dados ausentes identificados na tabela.",
          36,
          height - 90,
        );
        doc
          .fontSize(8)
          .text(`Página ${++pageNumber}/${totalPages}`, 36, height - 54, { lineBreak: false });
      }
      for (const page of pages) {
        if (pageNumber) addPage();
        doc
          .font(boldFont)
          .fontSize(16)
          .fillColor("#163d35")
          .text(`${titlePrefix}Relatório de consulta`, 36, 32);
        doc
          .font(regularFont)
          .fontSize(9)
          .fillColor("#333333")
          .text(
            plans.length > 1
              ? `${input.complete ? "Completo" : "PARCIAL"}: leituras sucessivas; sem snapshot comum.`
              : input.complete
                ? "Consulta completa; snapshot não comprovado."
                : "PARCIAL: somente o recorte solicitado.",
            36,
            60,
          )
          .text(
            `Leitura: ${brazilianDate(input.readAt, true)} | Linhas: ${input.rows.length.toLocaleString("pt-BR")}${input.sourceId ? ` | Fonte: ${input.sourceId}` : ""}`,
            36,
            78,
          );
        if (input.rows.length)
          doc.table({
            position: { x: 36, y: 104 },
            columnStyles: colWidths,
            rowStyles: (row) => ({
              height: row === 0 ? headerHeight : page.heights[row - 1]!,
              backgroundColor: row === 0 ? "#e5efeb" : "#ffffff",
            }),
            defaultStyle: {
              padding: 6,
              border: 0.4,
              borderColor: "#b9c9c2",
              textOptions: { ellipsis: false },
            },
            data: [[...input.columns], ...page.rows],
          });
        else
          doc.text(
            "Nenhum registro retornado. Ausência de linhas não significa total zero.",
            36,
            110,
          );
        doc
          .fontSize(8)
          .text(
            `Página ${++pageNumber}/${totalPages} | ${input.complete ? "Completo" : "PARCIAL"}`,
            36,
            height - 54,
            { width: width - 72, lineBreak: false },
          );
      }
    }
    if (actualPages !== totalPages) throw new Error("PDF_LAYOUT_INVALID");
    doc.end();
    return { data: await output, pages: totalPages };
  } catch (error) {
    doc.destroy();
    throw error;
  }
}
