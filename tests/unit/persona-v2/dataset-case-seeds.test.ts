import { expect, it } from "vitest";
import {
  datasetFixtureSeeds,
  confirmedDatasetCaseOrigin,
} from "../../../src/application/persona-v2/dataset-case-seeds.js";
import { createHash, randomUUID } from "node:crypto";
import { canonicalJson } from "../../../src/domain/persona-v2/catalog.js";
import { datasetCaseSeedsSchema } from "../../../src/domain/persona-v2/dataset-case-seeds.js";
import { queryTrainingSchema } from "../../../src/application/persona-v2/query-training.js";
import {
  templatePayloadSchema,
  type LibraryPayload,
} from "../../../src/application/persona-v2/knowledge-library-schema.js";
import { queryTraining } from "../../helpers/persona-v2-training.js";
import { structureContent } from "../../helpers/persona-v2-structure.js";

function fixture() {
  const template = templatePayloadSchema.parse({
    kind: "template",
    content: structureContent(),
  });
  const dataset: Extract<LibraryPayload, { kind: "dataset" }> = {
    kind: "dataset",
    templateId: "11111111-1111-4111-8111-111111111111",
    templateVersion: 1,
    templateHash: "a".repeat(64),
    provenance: { kind: "synthetic", description: "Sem dados operacionais" },
    tables: [
      {
        tableId: "orders",
        columns: [
          { name: "id", type: "integer" },
          { name: "amount", type: "decimal" },
        ],
        rows: [[9007199254740991, "1234567890123456.25"]],
      },
    ],
  };
  return { template, dataset, training: queryTrainingSchema.parse(queryTraining()) };
}
for (const dialect of ["postgres", "mssql", "sybase"] as const) {
  it(`semente ${dialect} usa nome físico exato e conserva inteiro/decimal`, () => {
    const { template, dataset, training } = fixture();
    training.dialect = dialect;
    const name = `${dialect === "postgres" ? "public" : dialect === "mssql" ? "dbo" : "dba"}.orders`;
    template.content.tables[0]!.physicalNames = [{ dialect, name }];
    training.tables[0]!.name = name;
    training.columns.forEach((c) => {
      c.table = name;
    });
    const original = structuredClone(dataset);
    expect(datasetFixtureSeeds(template, dataset, training)).toEqual([
      {
        table: name,
        generated: [],
        rows: [
          {
            id: { type: "integer", value: "9007199254740991" },
            amount: { type: "decimal", value: "1234567890123456.25" },
          },
        ],
      },
    ]);
    expect(dataset).toEqual(original);
  });
}
it("não trunca dataset maior que o limite de cem linhas", () => {
  const { template, dataset, training } = fixture();
  dataset.tables[0]!.rows = Array.from({ length: 101 }, (_, i) => [i, "1.00"]);
  expect(() => datasetFixtureSeeds(template, dataset, training)).toThrow(/100 registros/);
});
it("não converte ponto flutuante em decimal mesmo sem linhas", () => {
  const { template, dataset, training } = fixture();
  template.content.tables[0]!.columns[1]!.logicalType = "float";
  dataset.tables[0]!.columns[1]!.type = "number";
  dataset.tables[0]!.rows = [];
  expect(() => datasetFixtureSeeds(template, dataset, training)).toThrow(/ponto flutuante/);
});
it("recusa campos removidos ou reclassificados no rascunho", () => {
  const { template, dataset, training } = fixture();
  training.columns[1]!.classification = "pessoal";
  expect(() => datasetFixtureSeeds(template, dataset, training)).toThrow(/treinamento livre/);
  training.columns.pop();
  expect(() => datasetFixtureSeeds(template, dataset, training)).toThrow(/treinamento livre/);
});
it("não utiliza views como tabelas de sementes", () => {
  const { template, dataset, training } = fixture();
  template.content.tables[0]!.resourceType = "view";
  expect(() => datasetFixtureSeeds(template, dataset, training)).toThrow(/treinamento livre/);
});
it("conserva nulo, booleano, Unicode e datetime sem inferir valores", () => {
  const { template, dataset, training } = fixture();
  for (const [name, logicalType, nullable] of [
    ["label", "string", true],
    ["active", "boolean", false],
    ["seen", "datetime", false],
  ] as const) {
    template.content.tables[0]!.columns.push({
      name,
      meaning: "Fixture",
      logicalType,
      nullable,
      classification: "livre",
    });
    training.columns.push({ table: "orders", name, meaning: "Fixture", classification: "livre" });
    dataset.tables[0]!.columns.push({ name, type: logicalType });
  }
  dataset.tables[0]!.rows = [
    [1, "1.00", null, false, "2026-10-22T00:00:00Z"],
    [2, "2.00", "🙂é", true, "2026-10-22T00:00:00.000Z"],
  ];
  const seeds = datasetFixtureSeeds(template, dataset, training)[0]!;
  expect(seeds.rows[0]).toMatchObject({
    label: { type: "null", value: null },
    active: { type: "boolean", value: false },
    seen: { type: "date", value: "2026-10-22T00:00:00Z" },
  });
  expect(seeds.rows[1]!.label).toEqual({ type: "string", value: "🙂é" });
});

it("origem confirma referências e recalcula hashes/status sem confiar na alegação do navegador", () => {
  const { template, dataset, training } = fixture();
  const fixtures = datasetFixtureSeeds(template, dataset, training);
  const crypto = { sha256Hex: (text: string) => createHash("sha256").update(text).digest("hex") };
  const hash = crypto.sha256Hex(canonicalJson(fixtures));
  const templateRef = { id: randomUUID(), version: 1, hash: "a".repeat(64) };
  const datasetRef = { id: randomUUID(), version: 2, hash: "b".repeat(64) };
  const current = datasetCaseSeedsSchema.parse({
    revision: 2,
    sourceId: training.sourceId,
    catalogId: randomUUID(),
    template: templateRef,
    dataset: { ...datasetRef, name: "Sintético" },
    fixtures,
    executable: false,
    technicalApproval: false,
    origin: {
      format: "dataset-case-origin-v1",
      catalogId: randomUUID(),
      sourceId: training.sourceId,
      sourceVersion: 1,
      dialect: "postgres",
      template: templateRef,
      dataset: datasetRef,
      sourceSeedsHash: hash,
      caseSeedsHash: hash,
      modified: false,
    },
  });
  const supplied = {
    ...current.origin,
    sourceSeedsHash: "0".repeat(64),
    caseSeedsHash: "0".repeat(64),
    modified: true,
  };
  expect(confirmedDatasetCaseOrigin(supplied, current, fixtures, crypto)).toEqual(current.origin);
  const edited = structuredClone(fixtures);
  edited[0]!.rows[0]!.amount = { type: "decimal", value: "1.25" };
  const changed = confirmedDatasetCaseOrigin(supplied, current, edited, crypto);
  expect(changed.modified).toBe(true);
  expect(changed.sourceSeedsHash).toBe(hash);
  expect(changed.caseSeedsHash).not.toBe(hash);
  for (const mismatch of [
    { sourceId: randomUUID() },
    { catalogId: randomUUID() },
    { sourceVersion: 2 },
    { dataset: { ...datasetRef, version: 3 } },
    { template: { ...templateRef, hash: "c".repeat(64) } },
  ]) {
    expect(() =>
      confirmedDatasetCaseOrigin({ ...supplied, ...mismatch }, current, fixtures, crypto),
    ).toThrow(/origem editorial/);
  }
});
