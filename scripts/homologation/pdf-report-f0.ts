/** Synthetic PDFKit experiment. No runtime/SQL/credentials or caller-supplied content. */
import PDFDocument from "pdfkit";
import { createWriteStream } from "node:fs";
import { mkdir, writeFile, stat } from "node:fs/promises";
import { finished } from "node:stream/promises";
import { resolve } from "node:path";
import { cpus, platform, totalmem } from "node:os";
import { performance } from "node:perf_hooks";
import { syntheticMoney } from "./pdf-report-f0-contract.js";

const count = Number(process.argv[2]);
const orientation = process.argv[3] ?? "portrait";
if (
  ![0, 1, 30, 31, 60, 61, 5000].includes(count) ||
  !["portrait", "landscape"].includes(orientation)
) {
  throw new Error("Use a fixed synthetic F0 case and portrait/landscape.");
}
const out = resolve("node_modules/.cache/pdf-report-f0");
await mkdir(out, { recursive: true });
const name = `rows-${count}-${orientation}`;
const pdf = resolve(out, `${name}.pdf`);
const started = performance.now();
const baselineRss = process.memoryUsage().rss;
const rows = Array.from({ length: count }, (_, index) => [
  `ID${String(index + 1).padStart(6, "0")}`,
  index % 17 === 0
    ? "Descrição sintética longa: ação, café, açúcar e órgão.\nSegunda linha preservada."
    : "Produto sintético - café e açúcar",
  index % 13 === 0 ? "Não informado" : String(index + 1),
  syntheticMoney(index % 11 === 0 ? null : BigInt(index + 1) * 12345n),
]);
const doc = new PDFDocument({
  autoFirstPage: false,
  compress: true,
  bufferPages: false,
  info: { Title: "F0 - Dados exclusivamente sintéticos", Author: "plug_mcp - experimento local" },
});
const output = createWriteStream(pdf);
const completion = finished(output);
doc.on("error", (error) => output.destroy(error));
doc.pipe(output);
const landscape = orientation === "landscape";
const pageWidth = landscape ? 841.89 : 595.28;
const pageHeight = landscape ? 595.28 : 841.89;
const widths = [70, pageWidth - 72 - 70 - 85 - 100, 85, 100];
// Plan pages with the same font/width used by the native table. Never ellipsize a cell.
doc.addPage({ size: "A4", layout: landscape ? "landscape" : "portrait", margin: 36 });
doc.font("Helvetica").fontSize(9);
const heights = rows.map((row) =>
  Math.max(
    22,
    ...row.map((cell, i) => doc.heightOfString(cell, { width: widths[i]! - 12, lineGap: 0 }) + 14),
  ),
);
const pages: { rows: string[][]; heights: number[] }[] = [{ rows: [], heights: [] }];
let used = 28;
const available = pageHeight - 36 - 55 - 114;
for (let index = 0; index < rows.length; index++) {
  const height = heights[index]!;
  if (height > available - 28) throw new Error("Cell does not fit; reject rather than truncate.");
  if (used + height > available) {
    pages.push({ rows: [], heights: [] });
    used = 28;
  }
  pages.at(-1)!.rows.push(rows[index]!);
  pages.at(-1)!.heights.push(height);
  used += height;
}
let actualPages = 1;
doc.on("pageAdded", () => {
  actualPages++;
});
for (let index = 0; index < pages.length; index++) {
  if (index) doc.addPage({ size: "A4", layout: landscape ? "landscape" : "portrait", margin: 36 });
  doc
    .font("Helvetica-Bold")
    .fontSize(17)
    .fillColor("#163d35")
    .text("Relatório sintético | F0", 36, 32);
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor("#333333")
    .text("Fonte: fixture local | Período: 01/11/2026 a 20/11/2026 | Unidade: BRL", 36, 60)
    .text("Captura sintética completa; não certifica isolamento ou consulta em banco.", 36, 76)
    .text(`Linhas: ${count} | Sem totais inferidos | Nulos preservados`, 36, 92);
  doc.font("Helvetica").fontSize(9);
  if (count) {
    doc.table({
      position: { x: 36, y: 114 },
      columnStyles: widths,
      rowStyles: (row) => ({
        height: row === 0 ? 28 : pages[index]!.heights[row - 1]!,
        backgroundColor: row === 0 ? "#e5efeb" : row % 2 ? "#ffffff" : "#f5f7f6",
      }),
      defaultStyle: {
        padding: 6,
        border: 0.4,
        borderColor: "#b9c9c2",
        textOptions: { ellipsis: false },
      },
      data: [["Código", "Descrição", "Quantidade", "Valor (BRL)"], ...pages[index]!.rows],
    });
  } else doc.text("Nenhum registro na fixture. Não representa faturamento zero.", 36, 122);
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor("#555555")
    .text(
      `Página ${index + 1}/${pages.length} | Leitura sintética: 20/11/2026 12:00 UTC | F0`,
      36,
      pageHeight - 54,
      { width: pageWidth - 72, lineBreak: false },
    );
}
doc.end();
await completion;
if (actualPages !== pages.length) throw new Error("Unexpected automatic page break.");
const metrics = {
  synthetic: true,
  count,
  orientation,
  pages: actualPages,
  bytes: (await stat(pdf)).size,
  elapsedMs: Math.round(performance.now() - started),
  baselineRssBytes: baselineRss,
  peakRssKiB: process.resourceUsage().maxRSS,
  node: process.version,
  platform: platform(),
  cpu: cpus()[0]?.model,
  hostMemoryBytes: totalmem(),
  pdfkit: "0.20.2",
  concurrency: 1,
  measured: "single fresh process; generation only, no database/render validation",
};
await writeFile(resolve(out, `${name}.json`), JSON.stringify(metrics, null, 2));
process.stdout.write(`${JSON.stringify(metrics)}\n`);
