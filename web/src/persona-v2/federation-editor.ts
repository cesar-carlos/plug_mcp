import type { Training } from "./model";
import type {
  FederationTraining,
  FederationCase,
} from "../../../src/domain/persona-v2/federation-training";

export type TrainingStep = FederationTraining["steps"][number];
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
