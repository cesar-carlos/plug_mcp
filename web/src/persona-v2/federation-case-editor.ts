import {
  datasetCompositionSeedsSchema,
  type DatasetCompositionSeeds,
} from "../../../src/domain/persona-v2/dataset-composition";
import {
  federationDatasetSeedsSchema,
  type FederationDatasetSeeds,
} from "../../../src/domain/persona-v2/federation-dataset";
import type {
  FederationCase,
  FederationPublicationCase,
  FederationTraining,
} from "../../../src/domain/persona-v2/federation-training";
import { emptyFederationCase, type QueryDependency } from "./federation-editor";

export type FederationEditableCase = FederationCase | FederationPublicationCase;
export type FederationCaseMode = "transport" | "synthetic";
export type FederationCaseErrorCode = "INVALID_PLAN" | "INCOMPLETE_INPUT" | "BUDGET_EXCEEDED";

export interface FederationDatasetApplication {
  sourceId: string;
  fixtures: FederationPublicationCase["input"]["sources"][number]["fixtures"];
  origin: Exclude<
    FederationDatasetSeeds["origin"] | DatasetCompositionSeeds["origin"],
    { format: "operation-dataset-composition-v1" }
  >;
}

export function federationCaseIsSynthetic(value: FederationEditableCase): value is FederationCase {
  return "fixtures" in value.input;
}

export function federationCaseIsNative(
  value: FederationEditableCase,
): value is FederationPublicationCase {
  return "sources" in value.input;
}

export function federationDatasetDependencies(
  publications: readonly QueryDependency[],
  training: Pick<FederationTraining, "steps">,
  sourceId: string,
): QueryDependency[] {
  return publications.filter(
    (publication) =>
      publication.sourceId === sourceId &&
      training.steps.some((step) => step.kind === "local" && step.publicationId === publication.id),
  );
}

export function federationSourceTables(
  publications: readonly QueryDependency[],
  training: Pick<FederationTraining, "steps">,
  sourceId: string,
): QueryDependency["training"]["tables"] {
  return federationDatasetDependencies(publications, training, sourceId).flatMap(
    (publication) => publication.training.tables,
  );
}

export function federationSourceColumns(
  publications: readonly QueryDependency[],
  training: Pick<FederationTraining, "steps">,
  sourceId: string,
  table: string,
): string[] {
  return [
    ...new Set(
      federationDatasetDependencies(publications, training, sourceId).flatMap((publication) =>
        publication.training.columns
          .filter((column) => column.table === table)
          .map((column) => column.name),
      ),
    ),
  ];
}

export function federationSeedTableChoices(
  publications: readonly QueryDependency[],
  training: Pick<FederationTraining, "steps">,
  sourceId: string,
  currentTable: string,
): string[] {
  return [
    ...new Set([
      ...federationSourceTables(publications, training, sourceId).map((table) => table.name),
      ...(currentTable ? [currentTable] : []),
    ]),
  ];
}

export function emptyFederationEditableCase(
  training: FederationTraining,
  mode: FederationCaseMode,
): FederationEditableCase {
  const basic = emptyFederationCase(training);
  if (mode === "synthetic") {
    return basic;
  }
  return {
    name: "",
    input: {
      plan: basic.input.plan,
      sources: [
        ...new Set(
          training.steps.filter((step) => step.kind === "local").map((step) => step.sourceId),
        ),
      ].map((sourceId) => ({ sourceId, fixtures: [] })),
    },
    expected: { columns: [], rows: [], ordered: true, totalRows: 0 },
  };
}

export function federationCaseExpectedResult(
  value: "success" | FederationCaseErrorCode,
  native: boolean,
  training: FederationTraining,
): FederationEditableCase["expected"] {
  if (value === "success") {
    return native
      ? { columns: [], rows: [], ordered: true, totalRows: 0 }
      : emptyFederationCase(training).expected;
  }
  return { errorCode: value };
}

export function federationDatasetSeedApplication(
  value: FederationDatasetSeeds | DatasetCompositionSeeds,
): FederationDatasetApplication | undefined {
  const copy =
    value.origin.format === "federation-source-dataset-composition-v1"
      ? datasetCompositionSeedsSchema.parse(value)
      : federationDatasetSeedsSchema.parse(value);
  if (copy.origin.format === "operation-dataset-composition-v1") {
    return undefined;
  }
  return { sourceId: copy.sourceId, fixtures: copy.fixtures, origin: copy.origin };
}
