// Run only inside the dedicated network-none renderer fixture. Never connects to SQL.
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { networkInterfaces } from "node:os";
import { createConnection } from "node:net";
import assert from "node:assert/strict";
import { PdfSocketRenderer } from "/app/dist/infrastructure/persona-v2/pdf-render-client.js";

assert(Object.keys(networkInterfaces()).every((name) => name === "lo"));
assert(
  !Object.keys(process.env).some((name) =>
    /DATABASE_URL|ENCRYPTION|TOKEN|PASSWORD|SECRET/.test(name),
  ),
);
await assert.rejects(writeFile("/app/pdf-forbidden-write", "synthetic"));
await new Promise((resolve, reject) => {
  const socket = createConnection({ host: "192.0.2.1", port: 80 });
  socket.once("error", () => resolve());
  socket.once("connect", () => {
    socket.destroy();
    reject(new Error("NETWORK_ISOLATION_FAILED"));
  });
  socket.setTimeout(1000, () => {
    socket.destroy();
    reject(new Error("NETWORK_DENIAL_NOT_CONFIRMED"));
  });
});
const client = new PdfSocketRenderer("/run/se7e-pdf/renderer.sock");
const directory = "/tmp/pdf-renderer-evidence";
await mkdir(directory, { recursive: true });
const reports = [];
const runtimeHashes = {};
for (const file of [
  "pdf-renderer-main.js",
  "domain/persona-v2/pdf-format.js",
  "domain/persona-v2/pdf-renderer-failure.js",
  "domain/persona-v2/model.js",
  "domain/errors/error-codes.js",
  "infrastructure/persona-v2/pdf-render-slot.js",
  "infrastructure/persona-v2/pdf-renderer.js",
  "infrastructure/persona-v2/pdf-render-task.js",
  "infrastructure/persona-v2/pdf-render-client.js",
  "infrastructure/persona-v2/pdf-chart.js",
]) {
  runtimeHashes[file] = createHash("sha256")
    .update(await readFile(`/app/dist/${file}`))
    .digest("hex");
}
const charts = [];
for (const kind of ["bar", "line", "pie"]) {
  const rows = [
    ["Açúcar", "123.4500"],
    ["Café", "40.01"],
    ["Milho", kind === "pie" ? "20.00" : null],
  ];
  const result = await client.render(
    {
      orientation: "portrait",
      columns: ["Produto", "Valor"],
      rows,
      readAt: "2026-11-20T12:00:00.000Z",
      complete: false,
      maxPages: 10,
      maxBytes: 1048576,
      chart: { kind, categoryIndex: 0, valueIndex: 1, unit: "BRL" },
    },
    11000,
  );
  const filename = `chart-${kind}.pdf`;
  await writeFile(`${directory}/${filename}`, result.data);
  charts.push({ filename, kind, rows, pages: result.pages, bytes: result.data.length });
}
await writeFile(
  `${directory}/charts-manifest.json`,
  JSON.stringify({ charts, runtimeHashes }, null, 2),
);
for (const count of [0, 1, 30, 31, 60, 61, 5000]) {
  for (const orientation of count === 61 ? ["portrait", "landscape"] : ["portrait"]) {
    const rows = Array.from({ length: count }, (_, index) => [
      `ID${String(index + 1).padStart(6, "0")}`,
      `Produto sintético ${index + 1} — açúcar e café${index % 17 === 0 ? "\nSegunda linha preservada." : ""}`,
      index % 11 === 0 ? "Não informado" : `${(((index + 1) * 12345) / 100).toFixed(2)}`,
    ]);
    const start = performance.now();
    const result = await client.render(
      {
        orientation,
        columns: ["Código", "Descrição", "Valor (BRL)"],
        formats: ["text", "text", "currency"],
        rows,
        readAt: "2026-11-20T12:00:00.000Z",
        complete: false,
        maxPages: 250,
        maxBytes: 8388608,
      },
      11000,
    );
    const report = {
      count,
      orientation,
      pages: result.pages,
      bytes: result.data.byteLength,
      milliseconds: Math.round(performance.now() - start),
    };
    const stem = `rows-${count}-${orientation}`;
    await writeFile(`${directory}/${stem}.pdf`, result.data);
    await writeFile(`${directory}/${stem}.json`, JSON.stringify(report));
    reports.push(report);
  }
}
await writeFile(
  `${directory}/manifest.json`,
  JSON.stringify(
    {
      node: process.version,
      network: "none",
      readOnly: true,
      synthetic: true,
      reports,
      runtimeHashes,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    reports: reports.length,
    pages: reports.reduce((sum, report) => sum + report.pages, 0),
    synthetic: true,
  }),
);
