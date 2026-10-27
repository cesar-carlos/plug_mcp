export interface Catalog {
  id: string;
  name: string;
  role: string;
  authorizationVersion: number;
}

export interface CatalogPattern {
  id: string;
  slug: string;
  name: string;
  revision: number;
  content: unknown;
  activePublicationId: string | null;
}

export interface CatalogPublication {
  id: string;
  patternId: string;
  revision: number;
  hash: string;
  content: unknown;
  suspendedAt: string | null;
}

export interface CatalogPreview {
  reviewDueAt: string;
  confirmationHash: string;
  packageHash: string;
  expiresAt: string;
  content: unknown;
  changedFields: string[];
  changes: { kind: string; path: string }[];
  warnings: string[];
}

export interface CatalogMember {
  hubClientId: string;
  role: string;
}

export interface CatalogComparison {
  beforeHash: string;
  afterHash: string;
  changes: { kind: string; path: string }[];
}

export function catalogMayEdit(role: string | undefined): boolean {
  return !!role && role !== "reader";
}

export function catalogMayPublish(role: string | undefined): boolean {
  return role === "administrator" || role === "curator";
}

export function catalogEditorFingerprint(slug: string, name: string, content: unknown): string {
  return JSON.stringify({ slug, name, content });
}

export function catalogEditorDirty(input: {
  slug: string;
  name: string;
  content: unknown;
  saved: string;
}): boolean {
  return (
    (input.content !== undefined || !!input.slug || !!input.name) &&
    catalogEditorFingerprint(input.slug, input.name, input.content) !== input.saved
  );
}

export function catalogReviewPending(reviewDirty: Readonly<Record<string, boolean>>): boolean {
  return Object.values(reviewDirty).some(Boolean);
}

export function catalogFormsDirty(input: {
  editorDirty: boolean;
  catalogName: string;
  clientId: string;
  curationDirty: boolean;
  libraryDirty: boolean;
  reviewDirty: Readonly<Record<string, boolean>>;
  reviewDate: string;
}): boolean {
  return (
    input.editorDirty ||
    !!input.catalogName ||
    !!input.clientId ||
    input.curationDirty ||
    input.libraryDirty ||
    catalogReviewPending(input.reviewDirty) ||
    !!input.reviewDate
  );
}

export function catalogCreateHasPendingWork(input: {
  editorDirty: boolean;
  libraryDirty: boolean;
  curationDirty: boolean;
  reviewDate: string;
  reviewDirty: Readonly<Record<string, boolean>>;
}): boolean {
  return (
    input.editorDirty ||
    input.libraryDirty ||
    input.curationDirty ||
    !!input.reviewDate ||
    catalogReviewPending(input.reviewDirty)
  );
}

export function catalogPatternSwitchHasPendingWork(
  editorDirty: boolean,
  reviewDate: string,
): boolean {
  return editorDirty || !!reviewDate;
}

export function catalogImportedDdlHasPendingWork(input: {
  editorDirty: boolean;
  libraryDirty: boolean;
  reviewDate: string;
}): boolean {
  return input.editorDirty || input.libraryDirty || !!input.reviewDate;
}

export function catalogRoot(catalogId: string): string {
  return `/api/admin/catalogos/${catalogId}`;
}
