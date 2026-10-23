import { expect } from "vitest";
import { z } from "zod";
import { datasetCaseSeedsSchema } from "../../src/domain/persona-v2/dataset-case-seeds.js";
import { datasetCaseOptionsSchema } from "../../src/domain/persona-v2/dataset-case-options.js";
import type { QueryTraining } from "../../src/application/persona-v2/query-training.js";

interface EditorialPostResult {
  status: number;
  body: { skill?: { id: string }; [key: string]: unknown };
}
/** Synthetic operator explicitly reviews a copied example and chooses seeds; no runner reads a library implicitly. */
export async function createDatasetPublicationQuery(
  root: string,
  sourceVersion: number,
  training: QueryTraining,
  post: (path: string, body: object) => Promise<EditorialPostResult>,
): Promise<{
  queryId: string;
  fixtures: z.infer<typeof datasetCaseSeedsSchema>["fixtures"];
  origin: z.infer<typeof datasetCaseSeedsSchema>["origin"];
}> {
  const created = await post("/api/admin/catalogos", {
    name: `Material de runner ${training.dialect}`,
  });
  expect(created.status).toBe(201);
  const catalogId = z.object({ catalog: z.object({ id: z.uuid() }) }).parse(created.body)
    .catalog.id;
  const library = `/api/admin/catalogos/${catalogId}/biblioteca`;
  const content = {
    system: "Fixture privada",
    label: "runner-v1",
    dialects: [training.dialect],
    tables: [
      {
        id: "orders",
        name: "publication_orders",
        meaning: "Semente privada",
        resourceType: "table",
        grain: ["id"],
        physicalNames: [],
        columns: [
          { name: "id", logicalType: "integer", nullable: false },
          { name: "marker", logicalType: "string", nullable: true },
          { name: "revision", logicalType: "integer", nullable: false },
        ].map((column) => ({ ...column, meaning: column.name, classification: "livre" })),
      },
    ],
    relationships: [],
    rules: ["Dados artificiais"],
    examples: [
      {
        id: "fixture-main",
        purpose: training.purpose,
        explanation: "Modelo sintético revisto explicitamente pelo operador de fixture",
        state: "candidate",
        variants: [
          { dialect: training.dialect, sql: training.sqlModel, parameters: training.parameters },
        ],
      },
    ],
  };
  const templateResponse = await post(library, {
    slug: `fixture-template-${training.dialect}`,
    name: "Template privado",
    expectedVersion: 0,
    payload: { kind: "template", content },
  });
  expect(templateResponse.status, JSON.stringify(templateResponse.body)).toBe(201);
  const referenceSchema = z.object({
    id: z.uuid(),
    version: z.number().int().positive(),
    hash: z.string(),
  });
  const template = referenceSchema.parse(templateResponse.body);
  const datasetResponse = await post(library, {
    slug: `fixture-dataset-${training.dialect}`,
    name: "Dataset privado",
    expectedVersion: 0,
    payload: {
      kind: "dataset",
      templateId: template.id,
      templateVersion: template.version,
      templateHash: template.hash,
      provenance: { kind: "synthetic", description: "Somente fixture descartável do runner" },
      tables: [
        {
          tableId: "orders",
          columns: [
            { name: "id", type: "integer" },
            { name: "marker", type: "string" },
            { name: "revision", type: "integer" },
          ],
          rows: [[9, "anterior", 1]],
        },
      ],
    },
  });
  expect(datasetResponse.status, JSON.stringify(datasetResponse.body)).toBe(201);
  const dataset = referenceSchema.parse(datasetResponse.body);
  const chosenResponse = await post(`${library}/${dataset.id}/versoes`, {
    slug: `fixture-dataset-${training.dialect}`,
    name: "Dataset escolhido v2",
    expectedVersion: 1,
    payload: {
      kind: "dataset",
      templateId: template.id,
      templateVersion: template.version,
      templateHash: template.hash,
      provenance: { kind: "synthetic", description: "Escolha explícita para o runner" },
      tables: [
        {
          tableId: "orders",
          columns: [
            { name: "id", type: "integer" },
            { name: "marker", type: "string" },
            { name: "revision", type: "integer" },
          ],
          rows: [[10, "ação", 1]],
        },
      ],
    },
  });
  expect(chosenResponse.status, JSON.stringify(chosenResponse.body)).toBe(201);
  const chosen = referenceSchema.parse(chosenResponse.body);
  const imported = await post(`${root}/template`, {
    catalogId,
    templateId: template.id,
    templateVersion: template.version,
    templateHash: template.hash,
    sourceId: training.sourceId,
    sourceVersion,
    dialect: training.dialect,
    exampleId: "fixture-main",
    dataset: { id: dataset.id, version: dataset.version, hash: dataset.hash },
    slug: `generic-query-${training.dialect}`,
    name: "Consulta com casos nativos",
  });
  expect(imported.status, JSON.stringify(imported.body)).toBe(201);
  const queryId = imported.body.skill!.id;
  const reviewed = await post(`${root}/${queryId}/rascunho`, {
    expectedRevision: 1,
    name: "Consulta com casos nativos",
    training: {
      ...training,
      examples: [
        {
          id: "fixture-main",
          purpose: training.purpose,
          explanation: "Revisão explícita da fixture pelo operador",
          sql: training.sqlModel,
          state: "approved",
        },
      ],
    },
  });
  expect(reviewed.status, JSON.stringify(reviewed.body)).toBe(200);
  const original = await post(`${root}/${queryId}/sementes-dataset`, { expectedRevision: 2 });
  expect(original.status, JSON.stringify(original.body)).toBe(200);
  expect(datasetCaseSeedsSchema.parse(original.body).fixtures[0]!.rows[0]!.id).toEqual({
    type: "integer",
    value: "9",
  });
  const listed = await post(`${root}/${queryId}/datasets-caso`, { expectedRevision: 2 });
  expect(listed.status, JSON.stringify(listed.body)).toBe(200);
  const choices = datasetCaseOptionsSchema.parse(listed.body);
  expect(choices.datasets.find((item) => item.id === chosen.id && item.version === 2)?.hash).toBe(
    chosen.hash,
  );
  expect(JSON.stringify(choices)).not.toMatch(/"rows"|"fixtures"|payloadEnc/);
  const loaded = await post(`${root}/${queryId}/sementes-dataset`, {
    expectedRevision: 2,
    dataset: chosen,
  });
  expect(loaded.status, JSON.stringify(loaded.body)).toBe(200);
  const suggestion = datasetCaseSeedsSchema.parse(loaded.body);
  expect(suggestion.dataset.hash).toBe(chosen.hash);
  expect(suggestion.origin.dataset.version).toBe(2);
  expect(suggestion.technicalApproval).toBe(false);
  return { queryId, fixtures: suggestion.fixtures, origin: suggestion.origin };
}
