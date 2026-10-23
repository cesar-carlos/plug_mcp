import type { KnowledgeIndex } from "../persona-v2/knowledge-context.js";

/** Rebuildable metadata projection. It never grants access or stores query results. */
export interface PublicationKnowledgeIndexPort {
  get(
    personaId: string,
    publicationId: string,
    packageHash: string,
  ): Promise<KnowledgeIndex | null>;
  save(
    personaId: string,
    publicationId: string,
    packageHash: string,
    value: KnowledgeIndex,
  ): Promise<void>;
}
