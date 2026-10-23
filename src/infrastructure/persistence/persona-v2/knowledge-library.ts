import type pg from "pg";
import type {
  KnowledgeLibraryPort,
  KnowledgeLibraryVersion,
  KnowledgeDraftOrigin,
} from "../../../domain/ports/knowledge-library.port.js";
import { PersonaV2Error } from "../../../domain/persona-v2/model.js";
interface Row {
  id: string;
  catalog_id: string;
  slug: string;
  kind: KnowledgeLibraryVersion["kind"];
  version: number;
  name: string;
  hash: string;
  owner_id: string;
  created_at: Date;
  payload_enc: string;
  template_id: string | null;
  template_version: number | null;
}
const from = (r: Row): KnowledgeLibraryVersion => ({
  id: r.id,
  catalogId: r.catalog_id,
  slug: r.slug,
  kind: r.kind,
  version: r.version,
  name: r.name,
  hash: r.hash,
  ownerId: r.owner_id,
  createdAt: r.created_at.toISOString(),
  payloadEnc: r.payload_enc,
  templateId: r.template_id,
  templateVersion: r.template_version,
});
const select = `SELECT l.id,l.slug,l.kind,v.* FROM knowledge_library_v2 l
 JOIN knowledge_library_version_v2 v ON v.catalog_id=l.catalog_id AND v.library_id=l.id`;
export class PostgresKnowledgeLibrary implements KnowledgeLibraryPort {
  constructor(private readonly db: pg.PoolClient) {}
  async datasetVersions(
    catalogId: string,
    templateId: string,
    templateVersion: number,
    after?: { id: string; version: number },
  ): ReturnType<KnowledgeLibraryPort["datasetVersions"]> {
    if (after) {
      const cursor = await this.get(catalogId, after.id, after.version);
      if (
        cursor?.kind !== "dataset" ||
        cursor.templateId !== templateId ||
        cursor.templateVersion !== templateVersion
      ) {
        throw new PersonaV2Error(
          "AUTHORIZATION_DENIED",
          "Cursor de datasets indisponível neste template.",
        );
      }
    }
    const result = await this.db.query<
      Pick<KnowledgeLibraryVersion, "id" | "name" | "version" | "hash">
    >(
      `SELECT v.library_id AS id,v.name,v.version,v.hash FROM knowledge_library_version_v2 v
       JOIN knowledge_library_v2 l ON l.catalog_id=v.catalog_id AND l.id=v.library_id
       WHERE v.catalog_id=$1 AND v.template_id=$2 AND v.template_version=$3 AND l.kind='dataset'
       AND ($4::uuid IS NULL OR (v.library_id,v.version)<($4::uuid,$5::integer))
       ORDER BY v.library_id DESC,v.version DESC LIMIT 21`,
      [catalogId, templateId, templateVersion, after?.id ?? null, after?.version ?? null],
    );
    return result.rows;
  }
  async draftOrigin(personaId: string, skillId: string): Promise<KnowledgeDraftOrigin | null> {
    const result = await this.db.query<KnowledgeDraftOrigin>(
      `SELECT persona_id AS "personaId", skill_id AS "skillId", catalog_id AS "catalogId",
       template_id AS "templateId", template_version AS "templateVersion", source_id AS "sourceId",
       source_version AS "sourceVersion", dialect, dataset_id AS "datasetId", dataset_version AS "datasetVersion"
       FROM knowledge_library_draft_origin_v2 WHERE persona_id=$1 AND skill_id=$2`,
      [personaId, skillId],
    );
    return result.rows[0] ?? null;
  }
  async recordDraftOrigin(
    v: Parameters<KnowledgeLibraryPort["recordDraftOrigin"]>[0],
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO knowledge_library_draft_origin_v2(persona_id,skill_id,catalog_id,template_id,template_version,source_id,source_version,dialect,dataset_id,dataset_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        v.personaId,
        v.skillId,
        v.catalogId,
        v.templateId,
        v.templateVersion,
        v.sourceId,
        v.sourceVersion,
        v.dialect,
        v.datasetId,
        v.datasetVersion,
      ],
    );
  }
  async list(catalogId: string, beforeId?: string): Promise<KnowledgeLibraryVersion[]> {
    if (beforeId && !(await this.get(catalogId, beforeId))) {
      throw new PersonaV2Error("AUTHORIZATION_DENIED", "Cursor de biblioteca indisponível.");
    }
    const r = await this.db.query<Row>(
      `${select} WHERE l.catalog_id=$1 AND v.version=l.version AND ($2::uuid IS NULL OR l.id<$2) ORDER BY l.id DESC LIMIT 21`,
      [catalogId, beforeId ?? null],
    );
    return r.rows.map(from);
  }
  async get(
    catalogId: string,
    id: string,
    version?: number,
  ): Promise<KnowledgeLibraryVersion | null> {
    const r = await this.db.query<Row>(
      `${select} WHERE l.catalog_id=$1 AND l.id=$2 AND v.version=COALESCE($3::integer,l.version)`,
      [catalogId, id, version ?? null],
    );
    return r.rows[0] ? from(r.rows[0]) : null;
  }
  async save(v: KnowledgeLibraryVersion, expectedVersion: number): Promise<void> {
    if (expectedVersion === 0) {
      await this.db.query(
        "INSERT INTO knowledge_library_v2(id,catalog_id,slug,kind,version) VALUES($1,$2,$3,$4,1)",
        [v.id, v.catalogId, v.slug, v.kind],
      );
    } else {
      const changed = await this.db.query(
        "UPDATE knowledge_library_v2 SET version=$4 WHERE id=$1 AND catalog_id=$2 AND version=$3 AND kind=$5 RETURNING id",
        [v.id, v.catalogId, expectedVersion, v.version, v.kind],
      );
      if (changed.rowCount !== 1) {
        throw new PersonaV2Error("OPERATION_CONFLICT", "Biblioteca mudou; recarregue a versão.");
      }
    }
    await this.db.query(
      `INSERT INTO knowledge_library_version_v2(catalog_id,library_id,version,name,hash,owner_id,created_at,payload_enc,template_id,template_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        v.catalogId,
        v.id,
        v.version,
        v.name,
        v.hash,
        v.ownerId,
        v.createdAt,
        v.payloadEnc,
        v.templateId,
        v.templateVersion,
      ],
    );
  }
}
