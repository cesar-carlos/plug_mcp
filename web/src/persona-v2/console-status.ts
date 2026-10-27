export function queryDraftStatus(
  draft: { revision: number; activePublicationId: string | null },
  publication: { revision: number } | undefined,
): "publicado" | "alterações pendentes" | "publicação suspensa" | "rascunho" {
  if (publication) {
    return publication.revision === draft.revision ? "publicado" : "alterações pendentes";
  }
  return draft.activePublicationId ? "publicação suspensa" : "rascunho";
}

export function sourceLinkStatus(source: {
  replacedBySourceId?: string | null;
  active: boolean;
}): "Vínculo substituído" | "Vínculo ativo" | "Vínculo suspenso" {
  if (source.replacedBySourceId) {
    return "Vínculo substituído";
  }
  return source.active ? "Vínculo ativo" : "Vínculo suspenso";
}
