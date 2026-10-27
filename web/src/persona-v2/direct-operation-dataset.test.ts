import { describe, expect, it } from "vitest";
import type { DatasetCompositionSeeds } from "../../../src/domain/persona-v2/dataset-composition";
import type { DirectOperationDatasetSeeds } from "../../../src/domain/persona-v2/direct-operation-dataset";
import {
  canSelectLibraryDataset,
  compositionHasMaterial,
  compositionMaterialRefs,
  compositionSeedsMatchSelection,
  directOperationSeedsMatchSelection,
  editorialLibraryCatalogs,
  isCompositionSeeds,
  libraryDatasetPageError,
  listedDatasetVersion,
  mergeLibraryDatasets,
  receivedLibraryDatasetMatches,
  type DirectOperationDatasetMaterial,
  type LibraryDatasetItem,
} from "./direct-operation-dataset";

const hash = "a".repeat(64);
const catalogId = "11111111-1111-4111-8111-111111111111";
const sourceId = "22222222-2222-4222-8222-222222222222";
const datasetId = "33333333-3333-4333-8333-333333333333";
const otherId = "44444444-4444-4444-8444-444444444444";
const item = (id: string, extra?: Partial<LibraryDatasetItem>): LibraryDatasetItem => ({
  id,
  name: "Pedidos",
  kind: "dataset",
  version: 2,
  hash,
  ...extra,
});
const material = (
  extra?: Partial<DirectOperationDatasetMaterial>,
): DirectOperationDatasetMaterial => ({
  catalogId,
  dataset: { id: datasetId, version: 2, hash },
  name: "Pedidos",
  ...extra,
});

describe("regras da importação direta de dataset", () => {
  it("lista só catálogos com papel editorial e datasets da página", () => {
    expect(
      editorialLibraryCatalogs([
        { id: catalogId, name: "ERP", role: "contributor" },
        { id: otherId, name: "Leitura", role: "reader" },
      ]).map((catalog) => catalog.id),
    ).toEqual([catalogId]);
    expect(
      mergeLibraryDatasets([], [item(datasetId), item(otherId, { kind: "template" })], false),
    ).toEqual([item(datasetId)]);
    expect(
      mergeLibraryDatasets(
        [item(datasetId)],
        [item(datasetId, { version: 9 }), item(otherId)],
        true,
      ).map((value) => value.id),
    ).toEqual([datasetId, otherId]);
    expect(libraryDatasetPageError(0, null)).toBe("Nenhum dataset disponível neste catálogo.");
    expect(libraryDatasetPageError(0, otherId)).toBe(
      "Nenhum dataset nesta página; carregue mais itens.",
    );
    expect(libraryDatasetPageError(1, otherId)).toBeUndefined();
  });

  it("confere versão escolhida sem adotar a mais recente nem repetir material", () => {
    expect(listedDatasetVersion([item(datasetId, { version: 3 })], datasetId)).toBe(3);
    expect(listedDatasetVersion([], datasetId)).toBe(1);
    expect(canSelectLibraryDataset([item(datasetId)], datasetId, 2)).toBe(true);
    expect(canSelectLibraryDataset([item(datasetId)], otherId, 2)).toBe(false);
    expect(canSelectLibraryDataset([item(datasetId)], datasetId, 1.5)).toBe(false);
    expect(receivedLibraryDatasetMatches(item(datasetId), datasetId, 2)).toBe(true);
    expect(receivedLibraryDatasetMatches(item(datasetId, { kind: "template" }), datasetId, 2)).toBe(
      false,
    );
    expect(compositionHasMaterial([material()], material())).toBe(true);
    expect(
      compositionHasMaterial(
        [material()],
        material({ dataset: { id: otherId, version: 2, hash } }),
      ),
    ).toBe(false);
    expect(compositionMaterialRefs([material()])).toEqual([
      { catalogId, dataset: { id: datasetId, version: 2, hash } },
    ]);
  });

  it("reconhecem prévia de composição ou direta sem marcar execução", () => {
    const dataset = {
      id: datasetId,
      version: 2,
      hash,
      name: "Pedidos sintéticos",
    };
    const template = { id: otherId, version: 1, hash };
    const direct: DirectOperationDatasetSeeds = {
      revision: 4,
      sourceId,
      catalogId,
      template,
      dataset,
      fixtures: [{ table: "orders", generated: [], rows: [] }],
      origin: {
        format: "operation-direct-dataset-case-origin-v1",
        catalogId,
        sourceId,
        sourceVersion: 1,
        dialect: "postgres",
        template,
        dataset: { id: datasetId, version: 2, hash },
        sourceSeedsHash: hash,
        caseSeedsHash: hash,
        modified: false,
      },
      executable: false,
      technicalApproval: false,
    };
    const composition: DatasetCompositionSeeds = {
      revision: 4,
      sourceId,
      fixtures: [{ table: "orders", generated: [], rows: [] }],
      origin: {
        format: "operation-dataset-composition-v1",
        sourceId,
        sourceVersion: 1,
        dialect: "postgres",
        materials: [
          {
            catalogId,
            dataset: { id: datasetId, version: 2, hash },
            template,
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
    expect(isCompositionSeeds(direct)).toBe(false);
    expect(isCompositionSeeds(composition)).toBe(true);
    expect(
      directOperationSeedsMatchSelection({
        result: direct,
        revision: 4,
        sourceId,
        catalogId,
        dataset: { id: datasetId, version: 2, hash },
      }),
    ).toBe(true);
    expect(
      directOperationSeedsMatchSelection({
        result: direct,
        revision: 5,
        sourceId,
        catalogId,
        dataset: { id: datasetId, version: 2, hash },
      }),
    ).toBe(false);
    const chosen = compositionMaterialRefs([material()]);
    expect(
      compositionSeedsMatchSelection({
        result: composition,
        revision: 4,
        sourceId,
        chosen,
      }),
    ).toBe(true);
    expect(
      compositionSeedsMatchSelection({
        result: composition,
        revision: 4,
        sourceId,
        federationPublicationId: otherId,
        chosen,
      }),
    ).toBe(false);
    expect(direct.executable).toBe(false);
    expect(composition.technicalApproval).toBe(false);
  });
});
