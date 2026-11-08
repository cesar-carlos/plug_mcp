import { mkdir, writeFile } from "node:fs/promises";
import { KnowledgeGraphCache } from "../src/application/persona-v2/knowledge-graph-cache.js";
import { queryKnowledgeGraph } from "../src/application/persona-v2/knowledge-graph.js";
import { compileQueryTraining } from "../src/application/persona-v2/query-training.js";
import { queryResponseBytes } from "../src/application/persona-v2/query-response-size.js";
import { binaryMedia } from "../src/application/persona-v2/binary-attachment.js";
import { NodeCryptoAdapter } from "../src/infrastructure/crypto/node-crypto.adapter.js";
import { queryTraining, trainingSource } from "../tests/helpers/persona-v2-training.js";
import type { CatalogPublication } from "../src/domain/persona-v2/catalog.js";

// Synthetic CPU-only fixture; no env credentials, database, network or business data.
const crypto = new NodeCryptoAdapter("a".repeat(64));
const training = queryTraining();
training.columns.push(
  ...Array.from({ length: 200 }, (_, i) => ({
    table: "orders",
    name: `extra_${i}`,
    meaning: `Campo sintético ${i}`,
    classification: "livre" as const,
  })),
);
const pkg = compileQueryTraining(training, trainingSource, crypto);
const publication: CatalogPublication = {
  id: "fixture",
  personaId: trainingSource.personaId,
  skillId: "fixture",
  revision: 1,
  package: pkg,
  hash: "fixture",
  sourceVersion: 1,
  sourceFingerprint: pkg.sourceFingerprint,
  suspendedAt: null,
};
const cache = new KnowledgeGraphCache();
const response = {
  rows: Array.from({ length: 5000 }, (_, id) => ({ id, value: "Descrição sintética 😀" })),
  completeness: { complete: true },
};
const bytes = Buffer.alloc(8 * 1024 * 1024, 65);
bytes.write("%PDF-1.4");
const scenarios = [
  {
    name: "response-size",
    before: () => {
      Buffer.byteLength(JSON.stringify(response));
      return Buffer.byteLength(JSON.stringify({ ...response, reuse: { kind: "singleflight" } }));
    },
    after: () => queryResponseBytes(response, true),
  },
  {
    name: "graph-repeated-page",
    before: () => queryKnowledgeGraph(publication),
    after: () => cache.get("fixture", () => queryKnowledgeGraph(publication)),
  },
  {
    name: "binary-signature",
    before: () => binaryMedia(Buffer.from(bytes), ["application/pdf"]),
    after: () => binaryMedia(bytes, ["application/pdf"]),
  },
];
const results = [];
for (const scenario of scenarios) {
  for (let i = 0; i < 10; i++) {
    scenario.before();
    scenario.after();
  }
  const samples = { before: [] as number[], after: [] as number[] };
  for (let i = 0; i < 31; i++)
    for (const mode of i % 2 ? ["before", "after"] : ["after", "before"]) {
      const start = performance.now();
      scenario[mode === "before" ? "before" : "after"]();
      samples[mode === "before" ? "before" : "after"].push(performance.now() - start);
    }
  const median = (data: number[]) => [...data].sort((a, b) => a - b)[15]!;
  results.push({
    name: scenario.name,
    beforeMedianMs: median(samples.before),
    afterMedianMs: median(samples.after),
  });
}
await mkdir("test-results", { recursive: true });
const report = {
  node: process.version,
  fixture: "synthetic-local",
  rounds: 31,
  rows: 5000,
  graphColumns: 202,
  binaryBytes: bytes.length,
  results,
};
await writeFile("test-results/performance-cpu.json", JSON.stringify(report, null, 2));
process.stdout.write(JSON.stringify(report) + "\n");
