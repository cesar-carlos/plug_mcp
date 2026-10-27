import type { Draft, GrantPublication, Publication, Source } from "./model";

export interface PersonaLoadedData {
  sources: Source[];
  drafts: Draft[];
  publications: Record<string, Publication>;
  additionalPublications: Record<string, GrantPublication>;
}

export async function readPersonaData(
  api: <T>(url: string, body?: unknown) => Promise<T>,
  id: string,
): Promise<PersonaLoadedData> {
  const base = `/api/admin/personas/${id}`;
  const [s, d] = await Promise.all([
    api<{ fontes: Source[] }>(`${base}/fontes`),
    api<{ skills: Draft[] }>(`${base}/skills`),
  ]);
  const published: Record<string, Publication> = {};
  for (const draft of d.skills.filter(
    (item) => item.kind === "consulta" && item.activePublicationId,
  )) {
    const response = await api<{ publication: Publication | null }>(
      `${base}/skills/${draft.id}/publicacao`,
    );
    if (response.publication) {
      published[draft.id] = response.publication;
    }
  }
  const crossings: Record<string, GrantPublication> = {};
  for (const draft of d.skills.filter(
    (item) =>
      (item.kind === "cruzamento" || item.kind === "operacao_sql") && item.activePublicationId,
  )) {
    const response = await api<{ publication: GrantPublication | null }>(
      `${base}/skills/${draft.id}/publicacao`,
    );
    if (response.publication) {
      crossings[draft.id] = response.publication;
    }
  }
  for (const draft of d.skills.filter(
    (item) => item.kind === "acao_externa" && item.activePublicationId,
  )) {
    const response = await api<{ publication: GrantPublication | null }>(
      `${base}/integracoes/skills/${draft.id}/rascunho`,
    );
    if (response.publication) {
      crossings[draft.id] = response.publication;
    }
  }
  return {
    sources: s.fontes,
    drafts: d.skills,
    publications: published,
    additionalPublications: crossings,
  };
}
