import { expect, it } from "vitest";
import type { DatasetCompositionSeeds } from "../../../src/domain/persona-v2/dataset-composition";
import type { FederationDatasetSeeds } from "../../../src/domain/persona-v2/federation-dataset";
import { federationTraining } from "../../../tests/helpers/persona-v2-federation";
import {
  emptyFederationEditableCase,
  federationCaseExpectedResult,
  federationCaseIsNative,
  federationCaseIsSynthetic,
  federationDatasetDependencies,
  federationDatasetSeedApplication,
  federationSourceColumns,
  federationSourceTables,
} from "./federation-case-editor";
import type { QueryDependency } from "./federation-editor";
import type { Training } from "./model";

const refs = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    publicationId: "22222222-2222-4222-8222-222222222222",
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    publicationId: "44444444-4444-4444-8444-444444444444",
  },
];
const hash = "a".repeat(64);
const training = federationTraining(refs);
const queryTraining = (sourceId: string, extra?: string): Training => ({
  sourceId,
  dialect: "postgres",
  purpose: "Pedidos",
  sqlModel: "SELECT 1",
  tables: [{ name: "orders", meaning: "Pedidos", grain: ["id"] }],
  columns: [
    { table: "orders", name: "id", meaning: "ID", classification: "livre" },
    { table: "orders", name: "amount", meaning: "Valor", classification: "livre" },
    ...(extra ? [{ table: "orders", name: extra, meaning: extra, classification: "livre" }] : []),
  ],
  relationships: [],
  rules: [],
  parameters: [],
});
const publications: QueryDependency[] = [
  {
    id: refs[0].publicationId,
    sourceId: refs[0].id,
    name: "Pedidos A",
    revision: 1,
    sourceName: "ERP A",
    dialect: "postgres",
    training: queryTraining(refs[0].id),
  },
  {
    id: refs[1].publicationId,
    sourceId: refs[1].id,
    name: "Pedidos B",
    revision: 2,
    sourceName: "ERP B",
    dialect: "postgres",
    training: queryTraining(refs[1].id, "note"),
  },
  {
    id: "55555555-5555-4555-8555-555555555555",
    sourceId: refs[0].id,
    name: "Fora do plano",
    revision: 9,
    sourceName: "ERP A",
    dialect: "postgres",
    training: queryTraining(refs[0].id, "ignored"),
  },
];

it("caso sintético copia o plano; transporte cria sementes vazias por fonte local", () => {
  const synthetic = emptyFederationEditableCase(training, "synthetic");
  const transport = emptyFederationEditableCase(training, "transport");
  expect(federationCaseIsSynthetic(synthetic)).toBe(true);
  expect(federationCaseIsNative(transport)).toBe(true);
  expect(federationCaseIsSynthetic(transport)).toBe(false);
  if (!federationCaseIsNative(transport)) {
    throw new Error("esperado caso de transporte");
  }
  expect(transport.input.sources.map((source) => source.sourceId)).toEqual([
    refs[0].id,
    refs[1].id,
  ]);
  expect(transport.input.sources.every((source) => source.fixtures.length === 0)).toBe(true);
  expect(transport.expected).toEqual({ columns: [], rows: [], ordered: true, totalRows: 0 });
  expect(
    synthetic.input.plan.steps
      .filter((step) => step.kind === "local")
      .every((step) => step.sql === ""),
  ).toBe(true);
});

it("resultado esperado de sucesso não mistura formato sintético com tipado", () => {
  expect(federationCaseExpectedResult("success", false, training)).toEqual(
    emptyFederationEditableCase(training, "synthetic").expected,
  );
  expect(federationCaseExpectedResult("success", true, training)).toEqual({
    columns: [],
    rows: [],
    ordered: true,
    totalRows: 0,
  });
  expect(federationCaseExpectedResult("BUDGET_EXCEEDED", true, training)).toEqual({
    errorCode: "BUDGET_EXCEEDED",
  });
});

it("dependências e colunas usam só publicações locais do plano", () => {
  expect(
    federationDatasetDependencies(publications, training, refs[0].id).map((item) => item.id),
  ).toEqual([refs[0].publicationId]);
  expect(
    federationSourceTables(publications, training, refs[0].id).map((table) => table.name),
  ).toEqual(["orders"]);
  expect(federationSourceColumns(publications, training, refs[0].id, "orders")).toEqual([
    "id",
    "amount",
  ]);
  expect(federationSourceColumns(publications, training, refs[1].id, "orders")).toEqual([
    "id",
    "amount",
    "note",
  ]);
});

it("aplicação de dataset recusa composição de operação e exige publicação do plano", () => {
  const origin = {
    format: "federation-source-dataset-v1" as const,
    catalogId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    sourceId: refs[0].id,
    sourceVersion: 1,
    dialect: "postgres" as const,
    template: { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", version: 1, hash },
    dataset: { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", version: 1, hash },
    sourceSeedsHash: hash,
    caseSeedsHash: hash,
    modified: false,
    publicationId: refs[0].publicationId,
    publicationHash: hash,
    querySkillId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    queryRevision: 1,
  };
  const seeds: FederationDatasetSeeds = {
    revision: 1,
    sourceId: refs[0].id,
    catalogId: origin.catalogId,
    template: origin.template,
    dataset: { ...origin.dataset, name: "Pedidos" },
    fixtures: [{ table: "orders", generated: [], rows: [] }],
    origin,
    executable: false,
    technicalApproval: false,
  };
  expect(federationDatasetSeedApplication(seeds)).toEqual({
    sourceId: refs[0].id,
    fixtures: seeds.fixtures,
    origin,
  });
  const operation: DatasetCompositionSeeds = {
    revision: 1,
    sourceId: refs[0].id,
    fixtures: [{ table: "orders", generated: [], rows: [] }],
    origin: {
      format: "operation-dataset-composition-v1",
      sourceId: refs[0].id,
      sourceVersion: 1,
      dialect: "postgres",
      materials: [
        {
          catalogId: origin.catalogId,
          dataset: origin.dataset,
          template: origin.template,
          sourceSeedsHash: hash,
        },
      ],
      sourceSeedsHash: hash,
      caseSeedsHash: hash,
      modified: false,
    },
    executable: false,
    technicalApproval: false,
  };
  expect(() => federationDatasetSeedApplication(operation)).toThrow();
});
