/** Synthetic presentation fixture only; never queries a data source. */
import { mkdir, writeFile } from "node:fs/promises";
import { renderPdfReport } from "../../src/infrastructure/persona-v2/pdf-renderer.js";

const root = "node_modules/.cache/pdf-br-samples";
await mkdir(root, { recursive: true });
const base = {
  orientation: "landscape" as const,
  readAt: "2026-11-20T12:34:56Z",
  complete: false,
  maxPages: 10,
  maxBytes: 1048576,
};
const table = await renderPdfReport({
  ...base,
  columns: ["Código", "Data", "Quantidade", "Faturamento", "Ativo"],
  formats: ["text", "date", "number", "currency", "boolean"],
  rows: [
    ["000123", "2026-11-20", "1234.5", "98765.125", "true"],
    ["000124", "2024-02-29", "0", "-1.005", "false"],
    ["000125", null, null, null, null],
    ["000126", "2026-12-31", "2.125", "9007199254740993.125", "true"],
  ],
});
await writeFile(`${root}/tabela-br.pdf`, table.data);
const chart = await renderPdfReport({
  ...base,
  orientation: "portrait",
  columns: ["Data", "Faturamento"],
  formats: ["date", "currency"],
  rows: [
    ["2026-11-18", "1234.5"],
    ["2026-11-19", "2000.005"],
    ["2026-11-20", null],
  ],
  chart: { kind: "bar", categoryIndex: 0, valueIndex: 1, unit: "BRL" },
});
await writeFile(`${root}/grafico-br.pdf`, chart.data);
console.log(JSON.stringify({ synthetic: true, files: 2, pages: table.pages + chart.pages }));
