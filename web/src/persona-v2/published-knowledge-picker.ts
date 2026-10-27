import type {
  Catalog,
  KnowledgeSelection,
  ProfilePage,
  ProfilePublication,
  StandardPublication,
} from "./knowledge-model";
import type { Training } from "./model";

export function publishedKnowledgeSelection(
  catalogId: string,
  standard: StandardPublication | undefined,
  profile: ProfilePublication | undefined,
): KnowledgeSelection | undefined {
  if (!standard) {
    return undefined;
  }
  return {
    catalogId,
    standard,
    ...(profile ? { profile } : {}),
  };
}

export function isCatalogCurator(role: Catalog["role"] | undefined): boolean {
  return role === "administrator" || role === "curator";
}

export function appendProfilePublications(current: ProfilePage, data: ProfilePage): ProfilePage {
  return {
    ...data,
    drafts: current.drafts,
    nextDraftCursor: current.nextDraftCursor,
    publications: [...current.publications, ...data.publications],
  };
}

export function appendProfileDrafts(current: ProfilePage, data: ProfilePage): ProfilePage {
  return {
    ...current,
    drafts: [...current.drafts, ...data.drafts],
    nextDraftCursor: data.nextDraftCursor,
  };
}

export function catalogStillGranted(catalogs: readonly Catalog[], catalogId: string): boolean {
  return !catalogId || catalogs.some((catalog) => catalog.id === catalogId);
}

export function shouldLoadSavedStandard(
  initial: Training["sharedKnowledge"],
  catalogId: string,
  list: readonly Pick<StandardPublication, "id">[],
): boolean {
  return Boolean(
    initial?.catalogId === catalogId && !list.some((item) => item.id === initial.publicationId),
  );
}

export function savedProfileMissingOnPage(
  initial: Training["sharedKnowledge"],
  standardId: string,
  publications: readonly Pick<ProfilePublication, "publicationId">[],
): boolean {
  return Boolean(
    initial?.profilePublicationId &&
    standardId === initial.publicationId &&
    !publications.some((item) => item.publicationId === initial.profilePublicationId),
  );
}

export function publishedKnowledgeErrorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : "Não foi possível carregar o conhecimento.";
}

export const catalogUnavailableMessage =
  "O catálogo não está mais disponível. Selecione uma concessão vigente.";
