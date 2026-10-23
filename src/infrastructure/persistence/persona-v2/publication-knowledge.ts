import type pg from "pg";
import type { PublicationKnowledgeIndexPort } from "../../../domain/ports/publication-knowledge.port.js";
import {
  knowledgeDocumentsSchema,
  KNOWLEDGE_INDEX_VERSION,
  type KnowledgeIndex,
} from "../../../domain/persona-v2/knowledge-context.js";

export class PostgresPublicationKnowledgeIndex implements PublicationKnowledgeIndexPort {
  constructor(private readonly db: pg.PoolClient) {}
  async get(
    personaId: string,
    publicationId: string,
    packageHash: string,
  ): Promise<KnowledgeIndex | null> {
    const result = await this.db.query<{ documents: unknown; document_hash: string }>(
      "SELECT documents,document_hash FROM publication_knowledge_index_v2 WHERE persona_id=$1 AND publication_id=$2 AND package_hash=$3 AND index_version=$4",
      [personaId, publicationId, packageHash, KNOWLEDGE_INDEX_VERSION],
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    const parsed = knowledgeDocumentsSchema.safeParse(row.documents);
    return parsed.success ? { documents: parsed.data, hash: row.document_hash } : null;
  }
  async save(
    personaId: string,
    publicationId: string,
    packageHash: string,
    value: KnowledgeIndex,
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO publication_knowledge_index_v2(persona_id,publication_id,package_hash,index_version,documents,document_hash)
       VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(persona_id,publication_id,index_version) DO UPDATE
       SET documents=EXCLUDED.documents,document_hash=EXCLUDED.document_hash,rebuilt_at=now()
       WHERE publication_knowledge_index_v2.package_hash=EXCLUDED.package_hash`,
      [
        personaId,
        publicationId,
        packageHash,
        KNOWLEDGE_INDEX_VERSION,
        JSON.stringify(value.documents),
        value.hash,
      ],
    );
  }
}
