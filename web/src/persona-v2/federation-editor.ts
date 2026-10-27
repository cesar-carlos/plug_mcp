import type { CatalogPublication, PublishedPackage } from "../../../src/domain/persona-v2/catalog";
import type {
  FederationTraining,
  FederationCase,
} from "../../../src/domain/persona-v2/federation-training";
import type { Source, Training } from "./model";

export type TrainingStep = FederationTraining["steps"][number];
export const federationSemanticsLabels: {
  readonly [K in keyof FederationTraining["semantics"]]: string;
} = {
  matching: "Correspondência de registros",
  normalization: "Normalização das chaves",
  missing: "Ausência de registros",
  duplicates: "Duplicidades e grão",
  units: "Unidades",
  currency: "Moedas",
  calendar: "Calendário",
};
export function emptyFederation(): FederationTraining {
  return {
    purpose: "",
    semantics: {
      matching: "",
      normalization: "",
      missing: "",
      duplicates: "",
      units: "",
      currency: "",
      calendar: "",
    },
    steps: [newStep("local", "a"), newStep("local", "b"), newStep("join", "combined")],
    output: "combined",
    budget: {},
  };
}
export function newStep(kind: TrainingStep["kind"], id: string): TrainingStep {
  switch (kind) {
    case "local":
      return { kind, id, sourceId: "", publicationId: "", columns: [] };
    case "join":
      return {
        kind,
        id,
        left: "",
        right: "",
        join: "left",
        cardinality: "one_to_one",
        keys: [{ left: "", right: "" }],
        columns: [],
      };
    case "union":
      return { kind, id, inputs: [] };
    case "project":
      return { kind, id, input: "", columns: [] };
    case "aggregate":
      return {
        kind,
        id,
        input: "",
        dimensions: [],
        measures: [{ operation: "count", as: "count" }],
      };
    case "sort":
      return { kind, id, input: "", order: [] };
  }
}
/** Derive only declared projections. Missing references are retained for explicit correction. */
export function stepColumns(steps: readonly TrainingStep[], id: string): string[] {
  const index = steps.findIndex((s) => s.id === id);
  const step = steps[index];
  if (!step) {
    return [];
  }
  switch (step.kind) {
    case "local":
      return [...step.columns];
    case "join":
    case "project":
      return step.columns.map((c) => c.as);
    case "aggregate":
      return [...step.dimensions, ...step.measures.map((m) => m.as)];
    case "union":
      return stepColumns(steps.slice(0, index), step.inputs[0] ?? "");
    case "sort":
      return stepColumns(steps.slice(0, index), step.input);
  }
}
export function emptyFederationCase(training: FederationTraining): FederationCase {
  return {
    name: "",
    input: {
      plan: {
        // Alias for a case, never a real execution/publication identity.
        publicationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        steps: training.steps.map((s) =>
          s.kind === "local"
            ? {
                kind: s.kind,
                id: s.id,
                sourceId: s.sourceId,
                publicationId: s.publicationId,
                sql: "",
                params: {},
              }
            : (JSON.parse(JSON.stringify(s)) as Exclude<TrainingStep, { kind: "local" }>),
        ),
        output: training.output,
        page: 1,
        pageSize: 100,
      },
      fixtures: training.steps
        .filter((s) => s.kind === "local")
        .map((s) => ({ stepId: s.id, columns: [...s.columns], rows: [], truncated: false })),
    },
    expected: { columns: stepColumns(training.steps, training.output), rows: [], totalRows: 0 },
  };
}
export interface QueryDependency {
  id: string;
  sourceId: string;
  name: string;
  revision: number;
  sourceName: string;
  dialect: string;
  training: Training;
}

/** Keep only active query publications. Suspended or non-query packages stay out. */
export function federationPublicationCandidate(
  publication: CatalogPublication<PublishedPackage> | null,
  sources: readonly Pick<Source, "id" | "name" | "dialect" | "active">[],
): QueryDependency | null {
  if (
    !publication ||
    publication.suspendedAt ||
    publication.package.format !== "persona-query-v2"
  ) {
    return null;
  }
  const sourceId = publication.package.sourceId;
  const source = sources.find((item) => item.id === sourceId);
  if (!source?.active) {
    return null;
  }
  return {
    id: publication.id,
    sourceId: source.id,
    name: publication.package.name,
    revision: publication.revision,
    sourceName: source.name,
    dialect: source.dialect,
    training: publication.package.training as Training,
  };
}
