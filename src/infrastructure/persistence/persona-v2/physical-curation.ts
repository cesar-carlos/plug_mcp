import type pg from "pg";
import { PersonaV2Error } from "../../../domain/persona-v2/model.js";
import type {
  PhysicalCurationTransaction,
  PhysicalKnowledgeProposal,
} from "../../../domain/persona-v2/physical-curation.js";
interface Row {
  payload: PhysicalKnowledgeProposal;
  version: number;
  state: PhysicalKnowledgeProposal["state"];
  reviewer_id: string | null;
  reviewed_at: Date | null;
  reason: string | null;
}
const fromRow = (r: Row): PhysicalKnowledgeProposal => ({
  ...r.payload,
  version: r.version,
  state: r.state,
  reviewerId: r.reviewer_id,
  reviewedAt: r.reviewed_at?.toISOString() ?? null,
  reason: r.reason,
});
export class PostgresPhysicalCuration implements PhysicalCurationTransaction {
  constructor(private readonly db: pg.PoolClient) {}
  async create(p: PhysicalKnowledgeProposal): Promise<void> {
    await this.db.query(
      `INSERT INTO physical_knowledge_proposal_v2(id,catalog_id,profile_id,profile_publication_id,physical_source_id,identity_hash,base_publication_id,profile_hash,owner_id,persona_id,source_id,token_id,skill_id,payload,hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [
        p.id,
        p.catalogId,
        p.profileId,
        p.profilePublicationId,
        p.physicalSourceId,
        p.identityHash,
        p.basePublicationId,
        p.profileHash,
        p.ownerId,
        p.personaId,
        p.sourceId,
        p.tokenId,
        p.skillId,
        JSON.stringify(p),
        p.hash,
      ],
    );
  }
  async get(catalogId: string, id: string): Promise<PhysicalKnowledgeProposal | null> {
    const r = await this.db.query<Row>(
      "SELECT * FROM physical_knowledge_proposal_v2 WHERE catalog_id=$1 AND id=$2",
      [catalogId, id],
    );
    return r.rows[0] ? fromRow(r.rows[0]) : null;
  }
  async list(
    input: Parameters<PhysicalCurationTransaction["list"]>[0],
  ): ReturnType<PhysicalCurationTransaction["list"]> {
    const args = [
      input.catalogId,
      input.physicalSourceId,
      input.identityHash,
      input.profilePublicationId,
      input.ownerId,
    ];
    const scope =
      "catalog_id=$1 AND physical_source_id=$2 AND identity_hash=$3 AND profile_publication_id=$4 AND ($5::uuid IS NULL OR owner_id=$5)";
    if (
      input.beforeId &&
      (
        await this.db.query(
          `SELECT id FROM physical_knowledge_proposal_v2 WHERE ${scope} AND id=$6`,
          [...args, input.beforeId],
        )
      ).rowCount !== 1
    )
      throw new PersonaV2Error("AUTHORIZATION_DENIED", "Cursor de propostas indisponível.");
    const rows = (
      await this.db.query<Row>(
        `SELECT * FROM physical_knowledge_proposal_v2 WHERE ${scope} AND ($6::uuid IS NULL OR id<$6) ORDER BY id DESC LIMIT 21`,
        [...args, input.beforeId ?? null],
      )
    ).rows;
    return {
      proposals: rows.slice(0, 20).map(fromRow),
      nextCursor: rows.length > 20 ? rows[19]!.payload.id : null,
    };
  }
  async preview(
    hash: string,
    catalogId: string,
    proposalId: string,
    binding: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.db.query(
      "INSERT INTO physical_curation_preview_v2(hash,catalog_id,proposal_id,binding,expires_at) VALUES($1,$2,$3,$4,$5)",
      [hash, catalogId, proposalId, binding, expiresAt],
    );
  }
  async listForConsumer(
    input: Parameters<PhysicalCurationTransaction["listForConsumer"]>[0],
  ): ReturnType<PhysicalCurationTransaction["listForConsumer"]> {
    const args = [
      input.catalogId,
      input.physicalSourceId,
      input.identityHash,
      input.profilePublicationId,
      input.personaId,
      input.sourceId,
      input.tokenId,
      input.grantId,
      input.skillId,
    ];
    const scope =
      "catalog_id=$1 AND physical_source_id=$2 AND identity_hash=$3 AND profile_publication_id=$4 AND persona_id=$5 AND source_id=$6 AND token_id=$7 AND (payload->>'grantId') IS NOT DISTINCT FROM $8::text AND skill_id=$9";
    if (
      input.before &&
      (
        await this.db.query(
          `SELECT id FROM physical_knowledge_proposal_v2 WHERE ${scope} AND id=$10`,
          [...args, input.before],
        )
      ).rowCount !== 1
    )
      throw new PersonaV2Error("AUTHORIZATION_DENIED", "Cursor de propostas indisponível.");
    const rows = (
      await this.db.query<Row>(
        `SELECT * FROM physical_knowledge_proposal_v2 WHERE ${scope} AND ($10::uuid IS NULL OR id<$10) ORDER BY id DESC LIMIT 21`,
        [...args, input.before ?? null],
      )
    ).rows;
    return {
      proposals: rows.slice(0, 20).map(fromRow),
      nextCursor: rows.length > 20 ? rows[19]!.payload.id : null,
    };
  }
  async consume(
    hash: string,
    catalogId: string,
    proposalId: string,
    binding: string,
    now: Date,
  ): Promise<boolean> {
    return (
      (
        await this.db.query(
          "UPDATE physical_curation_preview_v2 SET consumed_at=$1 WHERE hash=$2 AND catalog_id=$3 AND proposal_id=$4 AND binding=$5 AND expires_at>$1 AND consumed_at IS NULL",
          [now, hash, catalogId, proposalId, binding],
        )
      ).rowCount === 1
    );
  }
  async decide(
    p: PhysicalKnowledgeProposal,
    decision: "incorporated" | "rejected",
    ownerId: string,
    reason: string,
    now: Date,
  ): Promise<void> {
    const r = await this.db.query(
      "UPDATE physical_knowledge_proposal_v2 SET state=$4,version=version+1,reviewer_id=$5,reason=$6,reviewed_at=$7 WHERE catalog_id=$1 AND id=$2 AND version=$3 AND state='pending'",
      [p.catalogId, p.id, p.version, decision, ownerId, reason, now],
    );
    if (r.rowCount !== 1)
      throw new PersonaV2Error("OPERATION_CONFLICT", "Proposta já revisada ou alterada.");
  }
}
