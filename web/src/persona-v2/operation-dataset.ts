import type { SkillDraft } from "../../../src/domain/persona-v2/catalog";
import type { DatasetCaseOptions } from "../../../src/domain/persona-v2/dataset-case-options";
import type { FederationDatasetSeeds } from "../../../src/domain/persona-v2/federation-dataset";
import type { OperationDatasetSeeds } from "../../../src/domain/persona-v2/operation-dataset";

export type OperationDatasetPreview = OperationDatasetSeeds | FederationDatasetSeeds;
export type DatasetCasePageMerge =
  { ok: true; datasets: DatasetCaseOptions["datasets"] } | { ok: false };

export function queryDraftSourceId(training: unknown): string | undefined {
  if (typeof training !== "object" || training === null || !("sourceId" in training)) {
    return undefined;
  }
  const sourceId = training.sourceId;
  return typeof sourceId === "string" ? sourceId : undefined;
}

export function sourceQueryDrafts(
  skills: readonly SkillDraft[],
  sourceId: string,
  federationPublicationId?: string,
): SkillDraft[] {
  return skills.filter(
    (skill) =>
      skill.kind === "consulta" &&
      (!federationPublicationId || skill.activePublicationId === federationPublicationId) &&
      queryDraftSourceId(skill.training) === sourceId,
  );
}

export function missingSourceQueriesMessage(queries: readonly SkillDraft[]): string | undefined {
  return queries.length
    ? undefined
    : "Nenhuma consulta da mesma fonte. Importe primeiro um template com dataset na biblioteca.";
}

export function datasetOptionsContextMatches(input: {
  page: DatasetCaseOptions;
  queryRevision: number;
  sourceId: string;
  more: boolean;
  previous?: DatasetCaseOptions;
}): boolean {
  if (input.page.revision !== input.queryRevision || input.page.sourceId !== input.sourceId) {
    return false;
  }
  if (
    input.more &&
    input.previous &&
    (input.page.catalogId !== input.previous.catalogId ||
      JSON.stringify(input.page.template) !== JSON.stringify(input.previous.template))
  ) {
    return false;
  }
  return true;
}

export function mergeDatasetCaseOptions(
  previous: DatasetCaseOptions | undefined,
  page: DatasetCaseOptions,
  more: boolean,
): DatasetCasePageMerge {
  const datasets = more && previous ? [...previous.datasets] : [];
  for (const item of page.datasets) {
    const existing = datasets.find(
      (value) => value.id === item.id && value.version === item.version,
    );
    if (existing && existing.hash !== item.hash) {
      return { ok: false };
    }
    if (!existing) {
      datasets.push(item);
    }
  }
  return { ok: true, datasets };
}

export function datasetOptionKey(item: { id: string; version: number }): string {
  return `${item.id}:${item.version}`;
}

export function selectedDatasetOption(
  options: DatasetCaseOptions | undefined,
  datasetKey: string,
): DatasetCaseOptions["datasets"][number] | undefined {
  return options?.datasets.find((item) => datasetOptionKey(item) === datasetKey);
}

export function operationDatasetSeedsPath(
  federationPublicationId: string | undefined,
): "sementes-dataset-cruzamento" | "sementes-dataset-operacao" {
  return federationPublicationId ? "sementes-dataset-cruzamento" : "sementes-dataset-operacao";
}

export function isFederationSourceSeeds(
  preview: OperationDatasetPreview,
): preview is FederationDatasetSeeds {
  return preview.origin.format === "federation-source-dataset-v1";
}

export function operationDatasetSeedsMatchSelection(input: {
  result: OperationDatasetPreview;
  revision: number;
  sourceId: string;
  querySkillId: string;
  queryRevision: number;
  federationPublicationId?: string;
  dataset?: { id: string; version: number; hash: string };
}): boolean {
  const { result } = input;
  if (
    result.revision !== input.revision ||
    result.sourceId !== input.sourceId ||
    result.origin.querySkillId !== input.querySkillId ||
    result.origin.queryRevision !== input.queryRevision
  ) {
    return false;
  }
  if (input.federationPublicationId) {
    if (
      !isFederationSourceSeeds(result) ||
      result.origin.publicationId !== input.federationPublicationId
    ) {
      return false;
    }
  }
  if (input.dataset) {
    return (
      result.dataset.id === input.dataset.id &&
      result.dataset.version === input.dataset.version &&
      result.dataset.hash === input.dataset.hash
    );
  }
  return true;
}
