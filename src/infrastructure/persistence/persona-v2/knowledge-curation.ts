import type pg from "pg";
import { PersonaV2Error } from "../../../domain/persona-v2/model.js";
import {
  knowledgeChangeSchema,
  type KnowledgeProposal,
  type KnowledgeCurationTransaction,
  type CurationPreview,
} from "../../../domain/persona-v2/knowledge-curation.js";
interface Row {
  id: string;
  catalog_id: string;
  pattern_id: string;
  base_publication_id: string;
  base_hash: string;
  owner_id: string;
  origin: KnowledgeProposal["origin"];
  persona_id: string | null;
  token_id: string | null;
  grant_id: string | null;
  source_id: string | null;
  skill_id: string | null;
  summary: string;
  change: unknown;
  hash: string;
  version: number;
  state: KnowledgeProposal["state"];
  created_at: Date;
  reviewer_id: string | null;
  reviewed_at: Date | null;
  reason: string | null;
}
const proposalFrom = (r: Row): KnowledgeProposal => ({
  id: r.id,
  catalogId: r.catalog_id,
  patternId: r.pattern_id,
  basePublicationId: r.base_publication_id,
  baseHash: r.base_hash,
  ownerId: r.owner_id,
  origin: r.origin,
  personaId: r.persona_id,
  tokenId: r.token_id,
  grantId: r.grant_id,
  sourceId: r.source_id,
  skillId: r.skill_id,
  summary: r.summary,
  change: knowledgeChangeSchema.parse(r.change),
  hash: r.hash,
  version: r.version,
  state: r.state,
  createdAt: r.created_at.toISOString(),
  reviewerId: r.reviewer_id,
  reviewedAt: r.reviewed_at?.toISOString() ?? null,
  reason: r.reason,
});
export class PostgresKnowledgeCuration implements KnowledgeCurationTransaction {
  constructor(private readonly db: pg.PoolClient) {}
  async lockCatalog(id: string): Promise<void> {
    await this.db.query("SELECT id FROM knowledge_catalog_v2 WHERE id=$1 FOR UPDATE", [id]);
  }
  async create(p: KnowledgeProposal): Promise<void> {
    await this.db.query(
      `INSERT INTO knowledge_proposal_v2(id,catalog_id,pattern_id,base_publication_id,base_hash,owner_id,origin,persona_id,token_id,grant_id,source_id,skill_id,summary,change,hash,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        p.id,
        p.catalogId,
        p.patternId,
        p.basePublicationId,
        p.baseHash,
        p.ownerId,
        p.origin,
        p.personaId,
        p.tokenId,
        p.grantId,
        p.sourceId,
        p.skillId,
        p.summary,
        JSON.stringify(p.change),
        p.hash,
        p.createdAt,
      ],
    );
  }
  async get(catalogId: string, id: string): Promise<KnowledgeProposal | null> {
    const result = await this.db.query<Row>(
      "SELECT * FROM knowledge_proposal_v2 WHERE catalog_id=$1 AND id=$2",
      [catalogId, id],
    );
    return result.rows[0] ? proposalFrom(result.rows[0]) : null;
  }
  async list(
    catalogId: string,
    ownerId: string | null,
    beforeId?: string,
  ): ReturnType<KnowledgeCurationTransaction["list"]> {
    if (beforeId) {
      const cursor = await this.db.query(
        "SELECT id FROM knowledge_proposal_v2 WHERE catalog_id=$1 AND id=$2 AND ($3::uuid IS NULL OR owner_id=$3)",
        [catalogId, beforeId, ownerId],
      );
      if (cursor.rowCount !== 1)
        throw new PersonaV2Error("AUTHORIZATION_DENIED", "Cursor indisponível.");
    }
    const rows = (
      await this.db.query<Row>(
        "SELECT * FROM knowledge_proposal_v2 WHERE catalog_id=$1 AND ($2::uuid IS NULL OR owner_id=$2) AND ($3::uuid IS NULL OR id<$3) ORDER BY id DESC LIMIT 21",
        [catalogId, ownerId, beforeId ?? null],
      )
    ).rows;
    return {
      proposals: rows.slice(0, 20).map(proposalFrom),
      nextCursor: rows.length > 20 ? rows[19]!.id : null,
    };
  }
  async listForConsumer(
    scope: Parameters<KnowledgeCurationTransaction["listForConsumer"]>[0],
    beforeId?: string,
  ): ReturnType<KnowledgeCurationTransaction["listForConsumer"]> {
    const values = [
      scope.catalogId,
      scope.basePublicationId,
      scope.personaId,
      scope.tokenId,
      scope.grantId,
      scope.skillId,
      scope.sourceId,
    ];
    const filter =
      "catalog_id=$1 AND base_publication_id=$2 AND persona_id=$3 AND token_id=$4 AND grant_id IS NOT DISTINCT FROM $5::uuid AND skill_id=$6 AND source_id=$7";
    if (beforeId) {
      const cursor = await this.db.query(
        `SELECT id FROM knowledge_proposal_v2 WHERE ${filter} AND id=$8`,
        [...values, beforeId],
      );
      if (cursor.rowCount !== 1)
        throw new PersonaV2Error("AUTHORIZATION_DENIED", "Cursor indisponível.");
    }
    const rows = (
      await this.db.query<Row>(
        `SELECT * FROM knowledge_proposal_v2 WHERE ${filter} AND ($8::uuid IS NULL OR id<$8) ORDER BY id DESC LIMIT 21`,
        [...values, beforeId ?? null],
      )
    ).rows;
    return {
      proposals: rows.slice(0, 20).map(proposalFrom),
      nextCursor: rows.length > 20 ? rows[19]!.id : null,
    };
  }
  async decide(
    catalogId: string,
    id: string,
    version: number,
    decision: "incorporated" | "rejected",
    reviewerId: string,
    reason: string,
    now: Date,
  ): Promise<void> {
    const result = await this.db.query(
      "UPDATE knowledge_proposal_v2 SET state=$4,version=version+1,reviewer_id=$5,reason=$6,reviewed_at=$7 WHERE catalog_id=$1 AND id=$2 AND version=$3 AND state='pending'",
      [catalogId, id, version, decision, reviewerId, reason, now],
    );
    if (result.rowCount !== 1)
      throw new PersonaV2Error("OPERATION_CONFLICT", "Proposta já revisada ou alterada.");
  }
  async preview(p: CurationPreview): Promise<void> {
    await this.db.query(
      "INSERT INTO knowledge_curation_preview_v2(hash,catalog_id,proposal_id,proposal_version,pattern_revision,content_hash,catalog_version,owner_id,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [
        p.hash,
        p.catalogId,
        p.proposalId,
        p.proposalVersion,
        p.patternRevision,
        p.contentHash,
        p.catalogVersion,
        p.ownerId,
        p.expiresAt,
      ],
    );
  }
  async consume(p: CurationPreview, now: Date): Promise<boolean> {
    const r = await this.db.query(
      "UPDATE knowledge_curation_preview_v2 SET consumed_at=$1 WHERE hash=$2 AND catalog_id=$3 AND proposal_id=$4 AND proposal_version=$5 AND pattern_revision=$6 AND content_hash=$7 AND catalog_version=$8 AND owner_id=$9 AND expires_at>$1 AND consumed_at IS NULL",
      [
        now,
        p.hash,
        p.catalogId,
        p.proposalId,
        p.proposalVersion,
        p.patternRevision,
        p.contentHash,
        p.catalogVersion,
        p.ownerId,
      ],
    );
    return r.rowCount === 1;
  }
}
