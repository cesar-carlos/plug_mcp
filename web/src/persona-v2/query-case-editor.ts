import type {
  DatasetCaseOptions,
  DatasetVersionReference,
} from "../../../src/domain/persona-v2/dataset-case-options";
import type { DatasetCaseSeeds } from "../../../src/domain/persona-v2/dataset-case-seeds";
import type { QueryPublicationCase } from "../../../src/domain/persona-v2/publication-fixture";

export type QueryCaseParameterStatus = "Nulo explícito" | "Valor informado" | "Omitido";

export function emptyQueryPublicationCase(): QueryPublicationCase {
  return {
    name: "",
    input: { params: {}, fixtures: [] },
    expected: { columns: [], rows: [], ordered: true },
  };
}

export function emptyQueryCaseFixture(
  table: string,
): QueryPublicationCase["input"]["fixtures"][number] {
  return { table, generated: [], rows: [] };
}

export function emptyQueryCaseExpectedColumn(): QueryPublicationCase["expected"]["columns"][number] {
  return { name: "", type: "string" };
}

export function queryCaseDatasetKey(value: { id: string; version: number }): string {
  return `${value.id}:${value.version}`;
}

export function queryCaseChosenDataset(
  options: DatasetCaseOptions | undefined,
  selected: string,
): DatasetVersionReference | undefined {
  const item = options?.datasets.find((value) => queryCaseDatasetKey(value) === selected);
  if (!item) {
    return undefined;
  }
  return { id: item.id, version: item.version, hash: item.hash };
}

export function queryCaseFingerprint(
  current: QueryPublicationCase | undefined,
  required: boolean,
): string {
  return JSON.stringify({ current, required });
}

export function queryCaseDatasetContextChanged(
  previous: DatasetCaseOptions,
  result: DatasetCaseOptions,
): boolean {
  return (
    result.revision !== previous.revision ||
    result.sourceId !== previous.sourceId ||
    result.catalogId !== previous.catalogId ||
    JSON.stringify(result.template) !== JSON.stringify(previous.template)
  );
}

export function queryCaseDatasetMatches(
  suggestion: Pick<DatasetCaseSeeds, "dataset">,
  dataset: DatasetVersionReference,
): boolean {
  return (
    suggestion.dataset.id === dataset.id &&
    suggestion.dataset.version === dataset.version &&
    suggestion.dataset.hash === dataset.hash
  );
}

export function applyQueryCaseSeeds(
  target: QueryPublicationCase,
  suggestion: DatasetCaseSeeds,
): void {
  target.input.fixtures = suggestion.fixtures;
  target.editorialOrigin = suggestion.origin;
}

export function queryCaseOptionalSql(value: string): string | undefined {
  return value || undefined;
}

export function queryCaseParameterStatus(
  params: QueryPublicationCase["input"]["params"],
  name: string,
): QueryCaseParameterStatus {
  if (!(name in params)) {
    return "Omitido";
  }
  return params[name] === null ? "Nulo explícito" : "Valor informado";
}

export function queryCaseErrorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}
