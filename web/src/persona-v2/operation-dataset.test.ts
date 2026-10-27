import { describe, expect, it } from "vitest";
import type { SkillDraft } from "../../../src/domain/persona-v2/catalog";
import type { DatasetCaseOptions } from "../../../src/domain/persona-v2/dataset-case-options";
import type { FederationDatasetSeeds } from "../../../src/domain/persona-v2/federation-dataset";
import type { OperationDatasetSeeds } from "../../../src/domain/persona-v2/operation-dataset";
import {
  datasetOptionKey,
  datasetOptionsContextMatches,
  isFederationSourceSeeds,
  mergeDatasetCaseOptions,
  missingSourceQueriesMessage,
  operationDatasetSeedsMatchSelection,
  operationDatasetSeedsPath,
  queryDraftSourceId,
  selectedDatasetOption,
  sourceQueryDrafts,
} from "./operation-dataset";

const hash = "a".repeat(64);
const otherHash = "b".repeat(64);
const sourceId = "22222222-2222-4222-8222-222222222222";
const otherSource = "55555555-5555-4555-8555-555555555555";
const queryId = "11111111-1111-4111-8111-111111111111";
const datasetId = "33333333-3333-4333-8333-333333333333";
const catalogId = "44444444-4444-4444-8444-444444444444";
const publicationId = "66666666-6666-4666-8666-666666666666";
const template = { id: catalogId, version: 1, hash };
const dataset = { id: datasetId, version: 2, hash, name: "Pedidos" };

const draft = (extra?: Partial<SkillDraft>): SkillDraft => ({
  id: queryId,
  personaId: sourceId,
  slug: "pedidos",
  kind: "consulta",
  name: "Pedidos",
  revision: 3,
  training: { sourceId },
  activePublicationId: publicationId,
  ...extra,
});

const page = (extra?: Partial<DatasetCaseOptions>): DatasetCaseOptions => ({
  revision: 3,
  sourceId,
  catalogId,
  template,
  datasets: [dataset],
  nextCursor: null,
  ...extra,
});

const originBase = {
  catalogId,
  sourceId,
  sourceVersion: 1,
  dialect: "postgres" as const,
  template,
  dataset: { id: datasetId, version: 2, hash },
  sourceSeedsHash: hash,
  caseSeedsHash: hash,
  modified: false,
  querySkillId: queryId,
  queryRevision: 3,
};

const operationSeeds = (): OperationDatasetSeeds => ({
  revision: 4,
  sourceId,
  catalogId,
  template,
  dataset,
  fixtures: [{ table: "orders", generated: [], rows: [] }],
  origin: { ...originBase, format: "operation-dataset-case-origin-v1" },
  executable: false,
  technicalApproval: false,
});

const federationSeeds = (): FederationDatasetSeeds => ({
  revision: 4,
  sourceId,
  catalogId,
  template,
  dataset,
  fixtures: [{ table: "orders", generated: [], rows: [] }],
  origin: {
    ...originBase,
    format: "federation-source-dataset-v1",
    publicationId,
    publicationHash: hash,
  },
  executable: false,
  technicalApproval: false,
});

describe("regras das sementes editoriais de operação", () => {
  it("lista só consultas da mesma fonte e publicação de cruzamento, sem adotar outra kind", () => {
    expect(queryDraftSourceId({ sourceId })).toBe(sourceId);
    expect(queryDraftSourceId("texto")).toBeUndefined();
    const listed = sourceQueryDrafts(
      [
        draft(),
        draft({ id: "operacao", kind: "operacao_sql" }),
        draft({ id: "outra-fonte", training: { sourceId: otherSource } }),
        draft({ id: "sem-publicacao", activePublicationId: null }),
      ],
      sourceId,
      publicationId,
    );
    expect(listed.map((item) => item.id)).toEqual([queryId]);
    expect(
      sourceQueryDrafts([draft({ activePublicationId: null })], sourceId).map((item) => item.id),
    ).toEqual([queryId]);
    expect(missingSourceQueriesMessage([])).toBe(
      "Nenhuma consulta da mesma fonte. Importe primeiro um template com dataset na biblioteca.",
    );
    expect(missingSourceQueriesMessage([draft()])).toBeUndefined();
  });

  it("acumula versões do dataset sem deduplicar hash divergente nem perder o original", () => {
    const first = page();
    expect(
      datasetOptionsContextMatches({
        page: first,
        queryRevision: 3,
        sourceId,
        more: false,
      }),
    ).toBe(true);
    expect(
      datasetOptionsContextMatches({
        page: page({ revision: 9 }),
        queryRevision: 3,
        sourceId,
        more: false,
      }),
    ).toBe(false);
    expect(
      datasetOptionsContextMatches({
        page: page({ catalogId: otherSource }),
        queryRevision: 3,
        sourceId,
        more: true,
        previous: first,
      }),
    ).toBe(false);
    const extra = { id: otherSource, version: 1, hash, name: "Itens" };
    expect(mergeDatasetCaseOptions(undefined, page({ datasets: [dataset, extra] }), false)).toEqual(
      {
        ok: true,
        datasets: [dataset, extra],
      },
    );
    expect(mergeDatasetCaseOptions(first, page({ datasets: [dataset] }), true)).toEqual({
      ok: true,
      datasets: [dataset],
    });
    expect(
      mergeDatasetCaseOptions(first, page({ datasets: [{ ...dataset, hash: otherHash }] }), true),
    ).toEqual({ ok: false });
    expect(datasetOptionKey(dataset)).toBe(`${datasetId}:2`);
    expect(selectedDatasetOption(first, `${datasetId}:2`)).toEqual(dataset);
    expect(selectedDatasetOption(first, `${datasetId}:9`)).toBeUndefined();
  });

  it("confere origem das sementes e escolhe o emit sem marcar execução", () => {
    expect(operationDatasetSeedsPath(undefined)).toBe("sementes-dataset-operacao");
    expect(operationDatasetSeedsPath(publicationId)).toBe("sementes-dataset-cruzamento");
    const operation = operationSeeds();
    const federation = federationSeeds();
    expect(isFederationSourceSeeds(operation)).toBe(false);
    expect(isFederationSourceSeeds(federation)).toBe(true);
    expect(
      operationDatasetSeedsMatchSelection({
        result: operation,
        revision: 4,
        sourceId,
        querySkillId: queryId,
        queryRevision: 3,
        dataset: { id: datasetId, version: 2, hash },
      }),
    ).toBe(true);
    expect(
      operationDatasetSeedsMatchSelection({
        result: operation,
        revision: 5,
        sourceId,
        querySkillId: queryId,
        queryRevision: 3,
      }),
    ).toBe(false);
    expect(
      operationDatasetSeedsMatchSelection({
        result: federation,
        revision: 4,
        sourceId,
        querySkillId: queryId,
        queryRevision: 3,
        federationPublicationId: publicationId,
      }),
    ).toBe(true);
    expect(
      operationDatasetSeedsMatchSelection({
        result: operation,
        revision: 4,
        sourceId,
        querySkillId: queryId,
        queryRevision: 3,
        federationPublicationId: publicationId,
      }),
    ).toBe(false);
    expect(operation.executable).toBe(false);
    expect(federation.technicalApproval).toBe(false);
  });
});
