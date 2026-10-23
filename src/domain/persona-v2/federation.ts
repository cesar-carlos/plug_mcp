export type DataScalar = string | number | boolean | null;
export type DataRow = Readonly<Record<string, DataScalar>>;
export interface FederationBudget {
  readonly sources: number;
  readonly steps: number;
  readonly concurrency: number;
  readonly rowsPerSource: number;
  readonly intermediateRows: number;
  readonly intermediateBytes: number;
  readonly timeoutMs: number;
}
export const DEFAULT_FEDERATION_BUDGET: FederationBudget = {
  sources: 4,
  steps: 8,
  concurrency: 2,
  rowsPerSource: 5000,
  intermediateRows: 10000,
  intermediateBytes: 16 * 1024 * 1024,
  timeoutMs: 60000,
};
export interface LocalStep {
  readonly kind: "local";
  readonly id: string;
  readonly sourceId: string;
  readonly publicationId: string;
  readonly sql: string;
  readonly params: Readonly<Record<string, DataScalar>>;
}
export interface JoinStep {
  readonly kind: "join";
  readonly id: string;
  readonly left: string;
  readonly right: string;
  readonly join: "inner" | "left";
  readonly keys: readonly { readonly left: string; readonly right: string }[];
  readonly cardinality: "one_to_one" | "many_to_one" | "one_to_many";
  readonly columns: readonly {
    readonly side: "left" | "right";
    readonly column: string;
    readonly as: string;
  }[];
}
export interface UnionStep {
  readonly kind: "union";
  readonly id: string;
  readonly inputs: readonly string[];
}
export interface ProjectStep {
  readonly kind: "project";
  readonly id: string;
  readonly input: string;
  readonly columns: readonly { readonly column: string; readonly as: string }[];
}
export interface AggregateStep {
  readonly kind: "aggregate";
  readonly id: string;
  readonly input: string;
  readonly dimensions: readonly string[];
  readonly measures: readonly {
    readonly operation: "count" | "sum" | "min" | "max";
    readonly column?: string;
    readonly as: string;
    readonly valueType?: "scalar" | "decimal";
  }[];
}
export interface SortStep {
  readonly kind: "sort";
  readonly id: string;
  readonly input: string;
  readonly order: readonly {
    readonly column: string;
    readonly direction: "asc" | "desc";
    readonly nulls: "first" | "last";
    readonly valueType?: "scalar" | "decimal";
  }[];
}
export type FederationStep =
  LocalStep | JoinStep | UnionStep | ProjectStep | AggregateStep | SortStep;
export interface FederationPlan {
  readonly publicationId: string;
  readonly steps: readonly FederationStep[];
  readonly output: string;
  readonly page: number;
  readonly pageSize: number;
}
export interface LocalQueryResult {
  readonly rows: readonly DataRow[];
  readonly columns: readonly string[];
  readonly truncated: boolean;
  readonly publicationHash: string;
  readonly readAt: string;
}
export interface FederationResult {
  readonly rows: readonly DataRow[];
  readonly columns: readonly string[];
  readonly totalRows: number;
  readonly complete: true;
  readonly provenance: readonly {
    readonly sourceId: string;
    readonly publicationId: string;
    readonly publicationHash: string;
    readonly readAt: string;
  }[];
}
