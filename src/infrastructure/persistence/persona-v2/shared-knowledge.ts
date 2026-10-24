import { randomUUID } from "node:crypto";
import type { KnowledgeImpactResource } from "../../../domain/persona-v2/knowledge-impact.js";
import type pg from "pg";
import type {
  KnowledgeCatalog,
  KnowledgeImpact,
  KnowledgeMember,
  KnowledgeRole,
  SharedKnowledgeRepositoryPort,
  SharedKnowledgeTransaction,
  StructureContent,
  StructureDraft,
  StructurePreview,
  StructurePublication,
} from "../../../domain/persona-v2/shared-knowledge.js";
import { PersonaV2Error } from "../../../domain/persona-v2/model.js";
import { PostgresKnowledgeCuration } from "./knowledge-curation.js";
import { PostgresKnowledgeMaintenance } from "./knowledge-maintenance.js";
import { PostgresKnowledgeLibrary } from "./knowledge-library.js";

interface DraftRow {
  id: string;
  catalogo_id: string;
  slug: string;
  nome: string;
  revisao: number;
  rascunho: StructureContent;
  publicacao_ativa_id: string | null;
}
interface PublicationRow {
  id: string;
  catalogo_id: string;
  padrao_id: string;
  revisao: number;
  pacote_hash: string;
  pacote: StructureContent;
  published_at: Date;
  suspended_at: Date | null;
}
const publicationFrom = (p: PublicationRow): StructurePublication => ({
  id: p.id,
  catalogId: p.catalogo_id,
  patternId: p.padrao_id,
  revision: p.revisao,
  hash: p.pacote_hash,
  content: p.pacote,
  publishedAt: p.published_at.toISOString(),
  suspendedAt: p.suspended_at?.toISOString() ?? null,
});
const draftFrom = (r: DraftRow): StructureDraft => ({
  id: r.id,
  catalogId: r.catalogo_id,
  slug: r.slug,
  name: r.nome,
  revision: r.revisao,
  content: r.rascunho,
  activePublicationId: r.publicacao_ativa_id,
});
export class PostgresSharedKnowledgeTransaction implements SharedKnowledgeTransaction {
  async impact(
    catalogId: string,
    publicationId: string,
    ownerId: string,
    after?: string,
    kind: "padrao" | "perfil" = "padrao",
    resource?: KnowledgeImpactResource,
  ): Promise<KnowledgeImpact> {
    const result = await this.db.query<KnowledgeImpact["publications"][number]>(
      `WITH RECURSIVE direct AS (
        SELECT p.id,p.persona_id FROM publicacao p JOIN persona a ON a.id=p.persona_id
        WHERE a.responsavel_id=$3 AND p.pacote->'sharedKnowledge'->>'catalogId'=$1::text
          AND p.pacote->'sharedKnowledge'->>$5::text=$2::text
          AND ($6::text IS NULL OR EXISTS (
            SELECT 1 FROM jsonb_array_elements(coalesce(p.pacote->'sharedKnowledge'->'expectedStructure'->'resources','[]'::jsonb)) r
            WHERE r->'resource'->>'name'=$6 AND (r->'resource'->>'schema') IS NOT DISTINCT FROM $7::text
              AND ($8::text IS NULL OR EXISTS (SELECT 1 FROM jsonb_array_elements(r->'columns') c WHERE c->>'name'=$8))
          ))
      ), affected(id,persona_id) AS (
        SELECT id,persona_id FROM direct
        UNION SELECT d.publicacao_id,d.persona_id FROM publicacao_dependencia d
        JOIN affected a ON a.id=d.dependencia_id AND a.persona_id=d.persona_id
      ) SELECT p.id AS "publicationId",p.persona_id AS "personaId",a.nome AS "personaName",
        p.skill_id AS "skillId",p.pacote->>'name' AS name,p.revisao AS revision,
        EXISTS(SELECT 1 FROM direct x WHERE x.id=p.id) AS direct,
        coalesce(s.publicacao_ativa_id=p.id AND x.publicacao_id IS NULL,false) AS active,
        x.publicacao_id IS NOT NULL AS suspended,
        coalesce((SELECT jsonb_agg(jsonb_build_object('id',f.id,'name',f.nome) ORDER BY f.id)
          FROM publicacao_fonte pf JOIN fonte f ON f.id=pf.fonte_id AND f.persona_id=pf.persona_id
          WHERE pf.publicacao_id=p.id AND pf.persona_id=p.persona_id),'[]'::jsonb) AS sources
      FROM affected d JOIN publicacao p ON p.id=d.id AND p.persona_id=d.persona_id
      JOIN persona a ON a.id=p.persona_id AND a.responsavel_id=$3
      JOIN skill_v2 s ON s.id=p.skill_id AND s.persona_id=p.persona_id
      LEFT JOIN publicacao_suspensao x ON x.publicacao_id=p.id AND x.persona_id=p.persona_id
      WHERE ($4::uuid IS NULL OR p.id>$4) ORDER BY p.id LIMIT 51`,
      [
        catalogId,
        publicationId,
        ownerId,
        after ?? null,
        kind === "perfil" ? "profilePublicationId" : "publicationId",
        resource?.name ?? null,
        resource?.schema ?? null,
        resource?.column ?? null,
      ],
    );
    const publications = result.rows.slice(0, 50);
    return {
      publications,
      nextCursor: result.rows.length > 50 ? publications.at(-1)!.publicationId : null,
    };
  }
  readonly library: PostgresKnowledgeLibrary;
  readonly maintenance: PostgresKnowledgeMaintenance;
  readonly curation: PostgresKnowledgeCuration;
  constructor(private readonly db: pg.PoolClient) {
    this.library = new PostgresKnowledgeLibrary(db);
    this.maintenance = new PostgresKnowledgeMaintenance(db);
    this.curation = new PostgresKnowledgeCuration(db);
  }
  async catalog(catalogId: string, ownerId: string): Promise<KnowledgeCatalog | null> {
    await this.db.query("SELECT id FROM knowledge_catalog_v2 WHERE id=$1 FOR SHARE", [catalogId]);
    const result = await this.db.query<{
      id: string;
      responsavel_id: string;
      nome: string;
      authorization_version: number;
      papel: KnowledgeRole;
    }>(
      `SELECT c.*,m.papel FROM knowledge_catalog_v2 c JOIN knowledge_member_v2 m
        ON m.catalogo_id=c.id WHERE c.id=$1 AND m.responsavel_id=$2`,
      [catalogId, ownerId],
    );
    const r = result.rows[0];
    return r
      ? {
          id: r.id,
          ownerId: r.responsavel_id,
          name: r.nome,
          authorizationVersion: r.authorization_version,
          role: r.papel,
        }
      : null;
  }
  async list(ownerId: string): Promise<readonly KnowledgeCatalog[]> {
    const result = await this.db.query<{ id: string }>(
      "SELECT catalogo_id AS id FROM knowledge_member_v2 WHERE responsavel_id=$1 ORDER BY catalogo_id",
      [ownerId],
    );
    const catalogs: KnowledgeCatalog[] = [];
    for (const row of result.rows) {
      const catalog = await this.catalog(row.id, ownerId);
      if (catalog) {
        catalogs.push(catalog);
      }
    }
    return catalogs;
  }
  async createCatalog(c: KnowledgeCatalog): Promise<void> {
    await this.db.query(
      "INSERT INTO knowledge_catalog_v2(id,responsavel_id,nome) VALUES($1,$2,$3)",
      [c.id, c.ownerId, c.name],
    );
    await this.db.query(
      "INSERT INTO knowledge_member_v2(catalogo_id,responsavel_id,papel) VALUES($1,$2,'administrator')",
      [c.id, c.ownerId],
    );
  }
  async members(catalogId: string): Promise<readonly KnowledgeMember[]> {
    const r = await this.db.query<{
      responsavel_id: string;
      hub_origin: string;
      hub_client_id: string;
      papel: KnowledgeRole;
    }>(
      `SELECT m.responsavel_id,m.papel,r.hub_origin,r.hub_client_id FROM knowledge_member_v2 m
       JOIN responsavel r ON r.id=m.responsavel_id WHERE m.catalogo_id=$1 ORDER BY m.responsavel_id`,
      [catalogId],
    );
    return r.rows.map((m) => ({
      ownerId: m.responsavel_id,
      hubOrigin: m.hub_origin,
      hubClientId: m.hub_client_id,
      role: m.papel,
    }));
  }
  async resolveOwner(hubOrigin: string, hubClientId: string): Promise<string> {
    const r = await this.db.query<{ id: string }>(
      `INSERT INTO responsavel(id,hub_origin,hub_client_id)
      VALUES($1,$2,$3) ON CONFLICT(hub_origin,hub_client_id) DO UPDATE SET hub_origin=EXCLUDED.hub_origin RETURNING id`,
      [randomUUID(), hubOrigin, hubClientId],
    );
    return r.rows[0]!.id;
  }
  async setMember(
    catalogId: string,
    member: KnowledgeMember | null,
    ownerId: string,
  ): Promise<void> {
    if (member) {
      await this.db.query(
        `INSERT INTO knowledge_member_v2(catalogo_id,responsavel_id,papel) VALUES($1,$2,$3)
        ON CONFLICT(catalogo_id,responsavel_id) DO UPDATE SET papel=EXCLUDED.papel`,
        [catalogId, ownerId, member.role],
      );
    } else {
      await this.db.query(
        "DELETE FROM knowledge_member_v2 WHERE catalogo_id=$1 AND responsavel_id=$2",
        [catalogId, ownerId],
      );
    }
    await this.db.query(
      "UPDATE knowledge_catalog_v2 SET authorization_version=authorization_version+1 WHERE id=$1",
      [catalogId],
    );
  }
  async drafts(catalogId: string): Promise<readonly StructureDraft[]> {
    const r = await this.db.query<DraftRow>(
      "SELECT * FROM structure_pattern_v2 WHERE catalogo_id=$1 ORDER BY slug",
      [catalogId],
    );
    return r.rows.map(draftFrom);
  }
  async draft(catalogId: string, patternId: string): Promise<StructureDraft | null> {
    const r = await this.db.query<DraftRow>(
      "SELECT * FROM structure_pattern_v2 WHERE catalogo_id=$1 AND id=$2",
      [catalogId, patternId],
    );
    return r.rows[0] ? draftFrom(r.rows[0]) : null;
  }
  async saveDraft(d: StructureDraft, expectedRevision: number | null): Promise<void> {
    const r =
      expectedRevision === null
        ? await this.db.query(
            `INSERT INTO structure_pattern_v2(id,catalogo_id,slug,nome,revisao,rascunho)
          VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(catalogo_id,slug) DO NOTHING`,
            [d.id, d.catalogId, d.slug, d.name, d.revision, JSON.stringify(d.content)],
          )
        : await this.db.query(
            `UPDATE structure_pattern_v2 SET nome=$3,rascunho=$4,revisao=revisao+1
          WHERE catalogo_id=$1 AND id=$2 AND revisao=$5`,
            [d.catalogId, d.id, d.name, JSON.stringify(d.content), expectedRevision],
          );
    if (r.rowCount !== 1) {
      throw new PersonaV2Error("OPERATION_CONFLICT", "Padrão mudou ou slug já existe.");
    }
  }
  async savePreview(p: StructurePreview): Promise<void> {
    await this.db.query(
      `INSERT INTO structure_preview_v2(hash,catalogo_id,padrao_id,responsavel_id,revisao,catalog_version,pacote_hash,expires_at,publicacao_anterior_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        p.hash,
        p.catalogId,
        p.patternId,
        p.ownerId,
        p.revision,
        p.catalogVersion,
        p.packageHash,
        p.expiresAt,
        p.previousPublicationId,
      ],
    );
  }
  async preview(catalogId: string, hash: string): Promise<StructurePreview | null> {
    const r = await this.db.query<{
      hash: string;
      catalogo_id: string;
      padrao_id: string;
      responsavel_id: string;
      revisao: number;
      catalog_version: number;
      pacote_hash: string;
      expires_at: Date;
      publicacao_anterior_id: string | null;
    }>(
      "SELECT * FROM structure_preview_v2 WHERE catalogo_id=$1 AND hash=$2 AND consumed_at IS NULL",
      [catalogId, hash],
    );
    const p = r.rows[0];
    return p
      ? {
          hash: p.hash,
          catalogId: p.catalogo_id,
          patternId: p.padrao_id,
          ownerId: p.responsavel_id,
          revision: p.revisao,
          catalogVersion: p.catalog_version,
          packageHash: p.pacote_hash,
          previousPublicationId: p.publicacao_anterior_id,
          expiresAt: p.expires_at,
        }
      : null;
  }
  async publish(p: StructurePublication, previewHash: string, now: Date): Promise<void> {
    const consumed = await this.db.query(
      `UPDATE structure_preview_v2 SET consumed_at=$3
      WHERE catalogo_id=$1 AND hash=$2 AND consumed_at IS NULL AND expires_at>$3`,
      [p.catalogId, previewHash, now],
    );
    if (consumed.rowCount !== 1) {
      throw new PersonaV2Error("OPERATION_CONFLICT", "Confirmação expirada ou consumida.");
    }
    await this.db.query(
      `INSERT INTO structure_publication_v2(id,catalogo_id,padrao_id,revisao,pacote,pacote_hash,published_at)
      VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [
        p.id,
        p.catalogId,
        p.patternId,
        p.revision,
        JSON.stringify(p.content),
        p.hash,
        p.publishedAt,
      ],
    );
    const updated = await this.db.query(
      `UPDATE structure_pattern_v2 SET publicacao_ativa_id=$3
      WHERE catalogo_id=$1 AND id=$2 AND revisao=$4`,
      [p.catalogId, p.patternId, p.id, p.revision],
    );
    if (updated.rowCount !== 1) {
      throw new PersonaV2Error("OPERATION_CONFLICT", "Rascunho mudou.");
    }
  }
  async publication(
    catalogId: string,
    publicationId: string,
  ): Promise<StructurePublication | null> {
    const r = await this.db.query<PublicationRow>(
      `SELECT p.*,s.suspended_at FROM structure_publication_v2 p LEFT JOIN structure_suspension_v2 s
       ON s.catalogo_id=p.catalogo_id AND s.publicacao_id=p.id WHERE p.catalogo_id=$1 AND p.id=$2`,
      [catalogId, publicationId],
    );
    const p = r.rows[0];
    return p ? publicationFrom(p) : null;
  }
  async publications(
    catalogId: string,
    patternId: string,
    includeSuspended: boolean,
    beforeId?: string,
  ): Promise<{ publications: readonly StructurePublication[]; nextCursor: string | null }> {
    const cursor = beforeId ? await this.publication(catalogId, beforeId) : null;
    if (
      beforeId &&
      (cursor?.patternId !== patternId || (!includeSuspended && cursor.suspendedAt))
    ) {
      throw new PersonaV2Error("AUTHORIZATION_DENIED", "Cursor de versões indisponível.");
    }
    const r = await this.db.query<PublicationRow>(
      `SELECT p.*,s.suspended_at FROM structure_publication_v2 p
       LEFT JOIN structure_suspension_v2 s ON s.catalogo_id=p.catalogo_id AND s.publicacao_id=p.id
       WHERE p.catalogo_id=$1 AND p.padrao_id=$2 AND ($3::boolean OR s.publicacao_id IS NULL)
       AND ($4::uuid IS NULL OR (p.published_at,p.id) < (
         SELECT published_at,id FROM structure_publication_v2 WHERE catalogo_id=$1 AND padrao_id=$2 AND id=$4))
       ORDER BY p.published_at DESC,p.id DESC LIMIT 21`,
      [catalogId, patternId, includeSuspended, beforeId ?? null],
    );
    return {
      publications: r.rows.slice(0, 20).map(publicationFrom),
      nextCursor: r.rows.length > 20 ? r.rows[19]!.id : null,
    };
  }
  async suspend(catalogId: string, publicationId: string, ownerId: string): Promise<void> {
    await this.db.query(
      `INSERT INTO structure_suspension_v2(catalogo_id,publicacao_id,responsavel_id)
      VALUES($1,$2,$3) ON CONFLICT(publicacao_id) DO NOTHING`,
      [catalogId, publicationId, ownerId],
    );
  }
  async audit(
    catalogId: string,
    ownerId: string,
    event: string,
    resourceId: string,
  ): Promise<void> {
    await this.db.query(
      "INSERT INTO knowledge_audit_v2(id,catalogo_id,responsavel_id,evento,recurso_id) VALUES($1,$2,$3,$4,$5)",
      [randomUUID(), catalogId, ownerId, event, resourceId],
    );
  }
}

export class PostgresSharedKnowledgeRepository implements SharedKnowledgeRepositoryPort {
  constructor(private readonly pool: pg.Pool) {}
  async transaction<T>(
    catalogId: string | null,
    action: (tx: SharedKnowledgeTransaction) => Promise<T>,
    beforeCommit: () => void,
  ): Promise<T> {
    const db = await this.pool.connect();
    try {
      await db.query("BEGIN");
      try {
        // One catalog serializes membership, preview and publication. No network is performed here.
        if (catalogId) {
          await db.query("SELECT id FROM knowledge_catalog_v2 WHERE id=$1 FOR UPDATE", [catalogId]);
        }
        const value = await action(new PostgresSharedKnowledgeTransaction(db));
        beforeCommit();
        await db.query("COMMIT");
        return value;
      } catch (error) {
        await db.query("ROLLBACK");
        throw error;
      }
    } finally {
      db.release();
    }
  }
}
