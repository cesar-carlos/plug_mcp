import type pg from "pg";
import { randomUUID } from "node:crypto";
import type {
  ReviewPlanTarget,
  ReviewPublicationPlan,
} from "../../../domain/persona-v2/review-publication.js";
import { PersonaV2Error } from "../../../domain/persona-v2/model.js";
import type {
  KnowledgeMaintenancePort,
  KnowledgeFeedback,
  ReviewCalendar,
  ReviewTarget,
} from "../../../domain/persona-v2/knowledge-maintenance.js";
interface FeedbackRow {
  payload: KnowledgeFeedback;
  version: number;
  state: KnowledgeFeedback["state"];
  proposal_id: string | null;
  proposal_kind: KnowledgeFeedback["proposalKind"];
  reviewer_id: string | null;
  reason: string | null;
}
const feedbackFrom = (r: FeedbackRow): KnowledgeFeedback => ({
  ...r.payload,
  version: r.version,
  state: r.state,
  proposalId: r.proposal_id,
  proposalKind: r.proposal_kind,
  reviewerId: r.reviewer_id,
  reason: r.reason,
});
interface ReviewRow {
  version: number;
  due_at: Date;
  owner_id: string;
  decided_at: Date;
  decision: ReviewCalendar["decision"];
  reason: string;
}
const reviewFrom = (r: ReviewRow): ReviewCalendar => ({
  version: r.version,
  dueAt: r.due_at.toISOString(),
  ownerId: r.owner_id,
  decidedAt: r.decided_at.toISOString(),
  decision: r.decision,
  reason: r.reason,
});
export class PostgresKnowledgeMaintenance implements KnowledgeMaintenancePort {
  async reviewTasks(
    t: ReviewTarget,
    owner: string,
    beforeId?: string,
  ): ReturnType<KnowledgeMaintenancePort["reviewTasks"]> {
    if (
      beforeId &&
      !(
        await this.db.query(
          "SELECT id FROM knowledge_review_task_v2 WHERE id=$1 AND kind=$2 AND publication_id=$3",
          [beforeId, t.kind, t.publicationId],
        )
      ).rowCount
    ) {
      throw new PersonaV2Error("AUTHORIZATION_DENIED", "Cursor de tarefas indisponível.");
    }
    const r = await this.db.query<{
      id: string;
      calendar_version: number;
      due_at: Date;
      created_at: Date;
      closed_at: Date | null;
      read_at: Date | null;
    }>(
      `SELECT t.*,v.read_at FROM knowledge_review_task_v2 t JOIN knowledge_review_notification_v2 n ON n.task_id=t.id
      LEFT JOIN knowledge_review_notification_read_v2 v ON v.task_id=t.id AND v.owner_id=$3 WHERE t.kind=$1 AND t.publication_id=$2 AND ($4::uuid IS NULL OR (t.created_at,t.id)<(SELECT c.created_at,c.id FROM knowledge_review_task_v2 c WHERE c.id=$4 AND c.kind=$1 AND c.publication_id=$2)) ORDER BY t.created_at DESC,t.id DESC LIMIT 21`,
      [t.kind, t.publicationId, owner, beforeId ?? null],
    );
    return {
      items: r.rows.slice(0, 20).map((v) => ({
        id: v.id,
        calendarVersion: v.calendar_version,
        dueAt: v.due_at.toISOString(),
        createdAt: v.created_at.toISOString(),
        closedAt: v.closed_at?.toISOString() ?? null,
        readAt: v.read_at?.toISOString() ?? null,
      })),
      nextCursor: r.rows.length > 20 ? r.rows[19]!.id : null,
    };
  }
  async readReviewTask(t: ReviewTarget, owner: string, id: string): Promise<void> {
    const r = await this.db.query(
      "INSERT INTO knowledge_review_notification_read_v2(task_id,owner_id) SELECT n.task_id,$4 FROM knowledge_review_notification_v2 n JOIN knowledge_review_task_v2 t ON t.id=n.task_id WHERE t.kind=$1 AND t.publication_id=$2 AND t.id=$3 ON CONFLICT(task_id,owner_id) DO UPDATE SET read_at=knowledge_review_notification_read_v2.read_at RETURNING task_id",
      [t.kind, t.publicationId, id, owner],
    );
    if (r.rowCount !== 1) {
      throw new PersonaV2Error("AUTHORIZATION_DENIED", "Notificação indisponível.");
    }
  }
  async reviewPlan(t: ReviewPlanTarget): Promise<ReviewPublicationPlan | null> {
    const r = await this.db.query<{
      kind: ReviewPlanTarget["kind"];
      draft_id: string;
      persona_id: string | null;
      catalog_id: string | null;
      revision: number;
      hash: string;
      version: number;
      due_at: Date;
      owner_id: string;
    }>(
      "SELECT * FROM knowledge_review_plan_v2 WHERE kind=$1 AND draft_id=$2 AND persona_id IS NOT DISTINCT FROM $3::uuid AND catalog_id IS NOT DISTINCT FROM $4::uuid AND revision=$5 AND hash=$6 FOR UPDATE",
      [t.kind, t.draftId, t.personaId, t.catalogId, t.revision, t.hash],
    );
    const v = r.rows[0];
    return v
      ? { ...t, version: v.version, dueAt: v.due_at.toISOString(), ownerId: v.owner_id }
      : null;
  }
  async saveReviewPlan(
    t: ReviewPlanTarget,
    dueAt: string,
    owner: string,
  ): Promise<ReviewPublicationPlan> {
    const r = await this.db.query<{ version: number }>(
      `INSERT INTO knowledge_review_plan_v2(kind,draft_id,persona_id,catalog_id,revision,hash,version,due_at,owner_id) VALUES($1,$2,$3,$4,$5,$6,1,$7,$8)
      ON CONFLICT(kind,draft_id) DO UPDATE SET revision=$5,hash=$6,version=knowledge_review_plan_v2.version+1,due_at=$7,owner_id=$8 WHERE knowledge_review_plan_v2.persona_id IS NOT DISTINCT FROM $3::uuid AND knowledge_review_plan_v2.catalog_id IS NOT DISTINCT FROM $4::uuid RETURNING version`,
      [t.kind, t.draftId, t.personaId, t.catalogId, t.revision, t.hash, dueAt, owner],
    );
    if (!r.rows[0]) {
      throw new PersonaV2Error("AUTHORIZATION_DENIED", "Plano fora do escopo.");
    }
    if (t.kind === "privado") {
      await this.db.query(
        "INSERT INTO audit_v2(id,persona_id,skill_id,responsavel_id,evento,origem,sucesso) VALUES($1,$2,$3,$4,'publicacao_prazo_definido','console',true)",
        [randomUUID(), t.personaId, t.draftId, owner],
      );
    } else {
      await this.db.query(
        "INSERT INTO knowledge_audit_v2(id,catalogo_id,responsavel_id,evento,recurso_id) VALUES($1,$2,$3,'publicacao_prazo_definido',$4)",
        [randomUUID(), t.catalogId, owner, t.draftId],
      );
    }
    return { ...t, dueAt, ownerId: owner, version: r.rows[0].version };
  }
  async bindReviewPlan(hash: string, plan: ReviewPublicationPlan): Promise<void> {
    await this.db.query("INSERT INTO knowledge_review_preview_v2(hash,plan) VALUES($1,$2)", [
      hash,
      JSON.stringify(plan),
    ]);
  }
  async boundReviewPlan(hash: string): Promise<ReviewPublicationPlan | null> {
    return (
      (
        await this.db.query<{ plan: ReviewPublicationPlan }>(
          "SELECT plan FROM knowledge_review_preview_v2 WHERE hash=$1",
          [hash],
        )
      ).rows[0]?.plan ?? null
    );
  }
  constructor(private readonly db: pg.PoolClient) {}
  async createFeedback(v: KnowledgeFeedback): Promise<void> {
    await this.db.query(
      "INSERT INTO knowledge_feedback_v2(id,persona_id,token_id,skill_id,publication_id,publication_hash,payload) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [
        v.id,
        v.personaId,
        v.tokenId,
        v.skillId,
        v.publicationId,
        v.publicationHash,
        JSON.stringify(v),
      ],
    );
  }
  async feedback(personaId: string, id: string): Promise<KnowledgeFeedback | null> {
    const r = await this.db.query<FeedbackRow>(
      "SELECT * FROM knowledge_feedback_v2 WHERE persona_id=$1 AND id=$2",
      [personaId, id],
    );
    return r.rows[0] ? feedbackFrom(r.rows[0]) : null;
  }
  async listFeedback(
    personaId: string,
    tokenId: string | null,
    beforeId?: string,
  ): ReturnType<KnowledgeMaintenancePort["listFeedback"]> {
    if (
      beforeId &&
      !(
        await this.db.query(
          "SELECT id FROM knowledge_feedback_v2 WHERE persona_id=$1 AND ($2::uuid IS NULL OR token_id=$2) AND id=$3",
          [personaId, tokenId, beforeId],
        )
      ).rowCount
    ) {
      throw new PersonaV2Error("AUTHORIZATION_DENIED", "Cursor indisponível.");
    }
    const r = await this.db.query<FeedbackRow>(
      "SELECT * FROM knowledge_feedback_v2 WHERE persona_id=$1 AND ($2::uuid IS NULL OR token_id=$2) AND ($3::uuid IS NULL OR id<$3) ORDER BY id DESC LIMIT 21",
      [personaId, tokenId, beforeId ?? null],
    );
    return {
      items: r.rows.slice(0, 20).map(feedbackFrom),
      nextCursor: r.rows.length > 20 ? r.rows[19]!.payload.id : null,
    };
  }
  async decideFeedback(
    v: KnowledgeFeedback,
    owner: string,
    reason: string,
    proposal: { id: string; kind: "padrao" | "perfil" } | null,
  ): Promise<void> {
    const r = await this.db.query(
      "UPDATE knowledge_feedback_v2 SET version=version+1,state=$4,proposal_id=$5,proposal_kind=$6,reviewer_id=$7,reason=$8 WHERE persona_id=$1 AND id=$2 AND version=$3 AND state='aberto'",
      [
        v.personaId,
        v.id,
        v.version,
        proposal ? "encaminhado" : "encerrado",
        proposal?.id ?? null,
        proposal?.kind ?? null,
        owner,
        reason,
      ],
    );
    if (r.rowCount !== 1) {
      throw new PersonaV2Error("OPERATION_CONFLICT", "Feedback já tratado ou alterado.");
    }
  }
  async calendar(t: ReviewTarget): Promise<ReviewCalendar | null> {
    const r = await this.db.query<ReviewRow>(
      "SELECT * FROM knowledge_review_v2 WHERE kind=$1 AND publication_id=$2 AND hash=$3 AND persona_id IS NOT DISTINCT FROM $4::uuid AND catalog_id IS NOT DISTINCT FROM $5::uuid",
      [t.kind, t.publicationId, t.hash, t.personaId, t.catalogId],
    );
    return r.rows[0] ? reviewFrom(r.rows[0]) : null;
  }
  async saveCalendar(t: ReviewTarget, expectedVersion: number, v: ReviewCalendar): Promise<void> {
    const args = [
      t.kind,
      t.publicationId,
      t.hash,
      t.personaId,
      t.catalogId,
      t.kind === "privado" ? t.publicationId : null,
      t.kind === "padrao" ? t.publicationId : null,
      t.kind === "perfil" ? t.publicationId : null,
      v.version,
      v.dueAt,
      v.ownerId,
      v.decidedAt,
      v.decision,
      v.reason,
      expectedVersion,
    ];
    const r = await this.db.query(
      `INSERT INTO knowledge_review_v2(kind,publication_id,hash,persona_id,catalog_id,private_publication_id,standard_publication_id,profile_publication_id,version,due_at,owner_id,decided_at,decision,reason)
      SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14 WHERE $15::int=0
      ON CONFLICT(kind,publication_id) DO NOTHING`,
      args,
    );
    if (expectedVersion === 0) {
      if (r.rowCount !== 1) {
        throw new PersonaV2Error("OPERATION_CONFLICT", "Calendário mudou; recarregue.");
      }
      return;
    }
    const updated = await this.db.query(
      "UPDATE knowledge_review_v2 SET version=$6,due_at=$7,owner_id=$8,decided_at=$9,decision=$10,reason=$11 WHERE kind=$1 AND publication_id=$2 AND hash=$3 AND persona_id IS NOT DISTINCT FROM $4::uuid AND catalog_id IS NOT DISTINCT FROM $5::uuid AND version=$12",
      [
        t.kind,
        t.publicationId,
        t.hash,
        t.personaId,
        t.catalogId,
        v.version,
        v.dueAt,
        v.ownerId,
        v.decidedAt,
        v.decision,
        v.reason,
        expectedVersion,
      ],
    );
    if (updated.rowCount !== 1) {
      throw new PersonaV2Error("OPERATION_CONFLICT", "Calendário mudou; recarregue.");
    }
  }
  async reviewHistory(t: ReviewTarget, beforeVersion?: number): Promise<readonly ReviewCalendar[]> {
    const r = await this.db.query<ReviewRow>(
      "SELECT h.* FROM knowledge_review_history_v2 h JOIN knowledge_review_v2 r USING(kind,publication_id) WHERE r.kind=$1 AND r.publication_id=$2 AND r.hash=$3 AND r.persona_id IS NOT DISTINCT FROM $4::uuid AND r.catalog_id IS NOT DISTINCT FROM $5::uuid AND ($6::int IS NULL OR h.version<$6) ORDER BY h.version DESC LIMIT 21",
      [t.kind, t.publicationId, t.hash, t.personaId, t.catalogId, beforeVersion ?? null],
    );
    return r.rows.map(reviewFrom);
  }
  async audit(
    personaId: string,
    skillId: string,
    publicationId: string,
    owner: string | null,
    token: string | null,
    event: string,
  ): Promise<void> {
    await this.db.query(
      "INSERT INTO audit_v2(id,persona_id,skill_id,publicacao_id,responsavel_id,token_id,evento,origem,sucesso) VALUES($1,$2,$3,$4,$5,$6,$7,$8,true)",
      [
        randomUUID(),
        personaId,
        skillId,
        publicationId,
        owner,
        token,
        event,
        token ? "mcp" : "console",
      ],
    );
  }
}
