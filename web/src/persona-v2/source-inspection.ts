import type { Inspection, Resource } from "./knowledge-model";
import type { Dialect } from "./model";

export const SOURCE_INSPECTION_PAGE_SIZE = 4;

export const sourceInspectionStatusLabel: Record<string, string> = {
  available: "Disponível",
  unavailable: "Metadados indisponíveis",
  not_authorized: "Sem autorização técnica",
  not_found: "Não encontrado",
};

export const sourceInspectionInvalidScopeMessage =
  "Informe de 1 a 16 tabelas ou views distintas, com nomes e schemas válidos.";

export function defaultInspectionSchema(dialect: Dialect): string | null {
  if (dialect === "firebird") {
    return null;
  }
  if (dialect === "postgres") {
    return "public";
  }
  if (dialect === "sybase") {
    return "DBA";
  }
  return "dbo";
}

export function emptyInspectionResource(
  dialect: Dialect,
  schema = defaultInspectionSchema(dialect),
): Resource {
  return { schema, name: "", type: "table" };
}

export function appendInspectionResource(resources: readonly Resource[]): Resource {
  return { schema: resources[0]?.schema ?? null, name: "", type: "table" };
}

export function sourceInspectionFingerprint(input: {
  resources: readonly Resource[];
  offset: number;
  sourceId: string;
  version: number;
  active: boolean;
}): string {
  return JSON.stringify({
    resources: input.resources,
    offset: input.offset,
    sourceId: input.sourceId,
    version: input.version,
    active: input.active,
  });
}

export function sourceInspectionScopeFingerprint(input: {
  resources: readonly Resource[];
  sourceId: string;
  version: number;
  active: boolean;
}): string {
  return JSON.stringify({
    resources: input.resources,
    sourceId: input.sourceId,
    version: input.version,
    active: input.active,
  });
}

export function liveInspectionPages<T extends { expiresAt: string }>(
  pages: readonly T[],
  now: number,
): T[] {
  return pages.filter((page) => Date.parse(page.expiresAt) > now);
}

export function inspectionHasExpired(expiresAt: string, now: number): boolean {
  return Date.parse(expiresAt) <= now;
}

export function replaceInspectionPage<T extends { evidence: { metadataPage: { offset: number } } }>(
  pages: readonly T[],
  next: T,
  offset: number,
): T[] {
  return [...pages.filter((page) => page.evidence.metadataPage.offset !== offset), next];
}

export function inspectionComposeBody(pages: readonly Pick<Inspection, "id">[]): {
  evidenceIds: string[];
} {
  return { evidenceIds: pages.map((page) => page.id) };
}

export function isInconclusiveComposition(raw: unknown): boolean {
  return Boolean(
    raw && typeof raw === "object" && "status" in raw && raw.status === "inconclusive",
  );
}

export function inspectionPageNumber(
  offset: number,
  pageSize = SOURCE_INSPECTION_PAGE_SIZE,
): number {
  return Math.floor(offset / pageSize) + 1;
}

export function inspectionResourceName(resource: { schema: string | null; name: string }): string {
  return resource.schema ? `${resource.schema}.${resource.name}` : resource.name;
}

export function inspectionNullableLabel(nullable: boolean | null): string {
  return nullable === null ? "Desconhecido" : nullable ? "Sim" : "Não";
}

export function sourceInspectionErrorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}
