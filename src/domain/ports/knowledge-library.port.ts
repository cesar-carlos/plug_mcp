export interface KnowledgeLibraryVersion {
  id: string;
  catalogId: string;
  slug: string;
  kind: "template" | "dataset";
  name: string;
  version: number;
  hash: string;
  ownerId: string;
  createdAt: string;
  payloadEnc: string;
  templateId: string | null;
  templateVersion: number | null;
}
export interface KnowledgeDraftOrigin {
  personaId: string;
  skillId: string;
  catalogId: string;
  templateId: string;
  templateVersion: number;
  sourceId: string;
  sourceVersion: number;
  dialect: string;
  datasetId: string | null;
  datasetVersion: number | null;
}
/** Editorial material, never executable publications, test reports or authority. */
export interface KnowledgeLibraryPort {
  datasetVersions(
    catalogId: string,
    templateId: string,
    templateVersion: number,
    after?: { id: string; version: number },
  ): Promise<Pick<KnowledgeLibraryVersion, "id" | "name" | "version" | "hash">[]>;
  draftOrigin(personaId: string, skillId: string): Promise<KnowledgeDraftOrigin | null>;
  recordDraftOrigin(input: KnowledgeDraftOrigin): Promise<void>;
  list(catalogId: string, beforeId?: string): Promise<KnowledgeLibraryVersion[]>;
  get(catalogId: string, id: string, version?: number): Promise<KnowledgeLibraryVersion | null>;
  save(value: KnowledgeLibraryVersion, expectedVersion: number): Promise<void>;
}
