import { DomainError } from "./domain-error.js";
import type { Dialeto } from "../entities/dialeto.js";

type ValidationReason =
  | "parser_syntax"
  | "unexpected_end"
  | "parser_failure_unclassified"
  | "multiple_statements"
  | "select_required"
  | "cte_binding"
  | "wildcard_projection";
interface Diagnostic {
  sqlValidationReason: ValidationReason;
  dialect?: Dialeto;
  parserLine?: number;
  parserColumn?: number;
}
interface PublicationContext {
  publicationIds: readonly string[];
  publicationRevisions: readonly number[];
  queryOrigin: "modelo_publicado" | "sql_fornecido";
}
// Metadata belongs to the locally produced error, never to caller/upstream details.
const diagnostics = new WeakMap<DomainError, Diagnostic>();
const publications = new WeakMap<DomainError, PublicationContext>();
export function sqlValidationFailure(error: DomainError, reason: ValidationReason): DomainError {
  diagnostics.set(error, { sqlValidationReason: reason });
  return error;
}
export function sqlParserFailure(
  error: DomainError,
  cause: unknown,
  dialect: Dialeto,
): DomainError {
  const raw = cause && typeof cause === "object" ? (cause as Record<string, unknown>) : {};
  const syntax = raw.name === "SyntaxError";
  const diagnostic: Diagnostic = {
    sqlValidationReason: syntax
      ? raw.found === null
        ? "unexpected_end"
        : "parser_syntax"
      : "parser_failure_unclassified",
    dialect,
  };
  const location =
    raw.location && typeof raw.location === "object"
      ? (raw.location as Record<string, unknown>)
      : {};
  const start =
    location.start && typeof location.start === "object"
      ? (location.start as Record<string, unknown>)
      : {};
  for (const [field, key] of [
    ["parserLine", "line"],
    ["parserColumn", "column"],
  ] as const) {
    const value = start[key];
    if (
      syntax &&
      typeof value === "number" &&
      Number.isSafeInteger(value) &&
      value > 0 &&
      value <= 100001
    )
      diagnostic[field] = value;
  }
  diagnostics.set(error, diagnostic);
  return error;
}
export function recordSqlValidationPublications(error: unknown, context: PublicationContext): void {
  if (error instanceof DomainError && error.code === "INVALID_SQL" && error.source === "sql")
    publications.set(error, {
      ...context,
      publicationIds: [...context.publicationIds],
      publicationRevisions: [...context.publicationRevisions],
    });
}
export function sqlValidationDiagnostic(error: unknown): Record<string, unknown> {
  if (!(error instanceof DomainError) || error.code !== "INVALID_SQL" || error.source !== "sql")
    return {};
  return {
    ...(diagnostics.get(error) ?? { sqlValidationReason: "unclassified_validation" }),
    ...(publications.get(error) ?? {}),
  };
}
