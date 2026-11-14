import { DomainError } from "./domain-error.js";

export interface AggregationGrain {
  readonly selectPath: readonly number[];
  readonly groupingKeyCount: number;
  readonly measureIndex?: number;
  readonly sourceIndex?: number;
  readonly targetIndex?: number;
}
interface AggregationContext {
  readonly publicationIds: readonly string[];
  readonly publicationRevisions: readonly number[];
  readonly queryOrigin: "modelo_publicado" | "sql_fornecido";
}
// Server-owned diagnostics only. Never read this context from error.details or input.
const grains = new WeakMap<DomainError, AggregationGrain>();
const contexts = new WeakMap<DomainError, AggregationContext>();
export function recordAggregationGrain(error: DomainError, grain: AggregationGrain): DomainError {
  grains.set(error, grain);
  return error;
}
export function recordAggregationContext(error: unknown, context: AggregationContext): void {
  if (error instanceof DomainError && error.code === "AGREGACAO_INSEGURA" && error.source === "sql")
    contexts.set(error, context);
}
export function aggregationDiagnostic(error: unknown): Record<string, unknown> {
  if (
    !(error instanceof DomainError) ||
    error.code !== "AGREGACAO_INSEGURA" ||
    error.source !== "sql"
  )
    return {};
  const grain = grains.get(error),
    context = contexts.get(error);
  return { ...(context ?? {}), ...(grain ? { aggregationGrain: grain } : {}) };
}
