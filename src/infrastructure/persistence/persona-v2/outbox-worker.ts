import type pg from "pg";
import { randomUUID } from "node:crypto";
import type { PersonaOutboxPort } from "../../../domain/ports/persona-outbox.port.js";
import type { OutboxClaim } from "../../../domain/persona-v2/notifications.js";
import { OUTBOX_LIMITS } from "../../../domain/persona-v2/notifications.js";

// Same predicate gates claim, dispatch (after DNS) and acknowledgement.
const authorized = `EXISTS(SELECT 1 FROM persona_notification_endpoint_v2 e JOIN persona p ON p.id=e.persona_id
 WHERE e.persona_id=o.persona_id AND e.active AND p.ativa AND e.version=o.notification_version AND o.evento=ANY(e.events))
 AND (CASE o.evento
 WHEN 'knowledge.review_due' THEN EXISTS(SELECT 1 FROM knowledge_review_task_v2 t JOIN knowledge_review_v2 r ON r.kind=t.kind AND r.publication_id=t.publication_id
 JOIN publicacao pub ON pub.id=t.publication_id AND pub.persona_id=o.persona_id
 WHERE t.id=o.aggregate_ids[1] AND t.kind='privado' AND t.closed_at IS NULL AND r.version=t.calendar_version
 AND NOT EXISTS(SELECT 1 FROM publicacao_suspensao s WHERE s.publicacao_id=pub.id))
 WHEN 'sql.operation_state' THEN EXISTS(SELECT 1 FROM operacao_v2 a WHERE a.id=o.aggregate_ids[1] AND a.persona_id=o.persona_id AND a.estado=o.metadata->>'state')
 WHEN 'external.action_state' THEN EXISTS(SELECT 1 FROM external_action_v2 a WHERE a.id=o.aggregate_ids[1] AND a.persona_id=o.persona_id AND a.estado=o.metadata->>'state')
 ELSE false END)`;

export class PostgresPersonaOutbox implements PersonaOutboxPort {
  constructor(private readonly pool: pg.Pool) {}
  async claim(): Promise<OutboxClaim | null> {
    const db = await this.pool.connect();
    try {
      await db.query("BEGIN");
      await db.query(`UPDATE outbox_v2 SET estado='dead_letter',failure_code='expired_or_inactive',lease_owner=NULL,lease_until=NULL WHERE id IN
       (SELECT o.id FROM outbox_v2 o WHERE o.notification_version IS NOT NULL AND o.estado='pendente'
        AND (o.lease_until IS NULL OR o.lease_until<=clock_timestamp()) AND
        (o.tentativas>=${OUTBOX_LIMITS.maxAttempts} OR o.created_at+interval '${OUTBOX_LIMITS.lifetimeHours} hours'<=clock_timestamp() OR NOT (${authorized}))
        ORDER BY o.created_at,o.id LIMIT 100 FOR UPDATE OF o SKIP LOCKED)`);
      const claim = randomUUID();
      const result = await db.query<OutboxClaim>(
        `UPDATE outbox_v2 o SET lease_owner=$1,lease_until=clock_timestamp()+interval '${OUTBOX_LIMITS.leaseSeconds} seconds',tentativas=tentativas+1
       WHERE o.id=(SELECT o.id FROM outbox_v2 o WHERE o.notification_version IS NOT NULL AND o.estado='pendente'
        AND o.available_at<=clock_timestamp() AND (o.lease_until IS NULL OR o.lease_until<=clock_timestamp())
        AND o.tentativas<${OUTBOX_LIMITS.maxAttempts} AND o.created_at+interval '${OUTBOX_LIMITS.lifetimeHours} hours'>clock_timestamp() AND ${authorized}
        ORDER BY o.available_at,o.id LIMIT 1 FOR UPDATE OF o SKIP LOCKED)
       RETURNING o.id,o.lease_owner AS claim,
       COALESCE(o.destino_enc,(SELECT e.destino_enc FROM persona_notification_endpoint_v2 e WHERE e.persona_id=o.persona_id AND e.version=o.notification_version)) AS "destinationEnc",
       COALESCE(o.segredo_enc,(SELECT e.segredo_enc FROM persona_notification_endpoint_v2 e WHERE e.persona_id=o.persona_id AND e.version=o.notification_version)) AS "secretEnc",o.tentativas AS attempts,
       jsonb_build_object('schema','se7e.persona.notification.v1','id',o.id,'personaId',o.persona_id,'event',o.evento,'occurredAt',to_char(o.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'metadata',o.metadata)::text AS body`,
        [claim],
      );
      await db.query("COMMIT");
      return result.rows[0] ?? null;
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    } finally {
      db.release();
    }
  }
  async authorize(row: OutboxClaim): Promise<boolean> {
    return (
      (
        await this.pool.query(
          `SELECT id FROM outbox_v2 o WHERE id=$1 AND lease_owner=$2 AND tentativas=$3 AND estado='pendente'
      AND lease_until>clock_timestamp() AND created_at+interval '${OUTBOX_LIMITS.lifetimeHours} hours'>clock_timestamp() AND ${authorized}`,
          [row.id, row.claim, row.attempts],
        )
      ).rowCount === 1
    );
  }
  async finish(row: OutboxClaim, delivered: boolean): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE outbox_v2 o SET
      estado=CASE WHEN NOT (${authorized}) THEN 'dead_letter' WHEN $4 THEN 'entregue'
       WHEN tentativas>=${OUTBOX_LIMITS.maxAttempts} OR created_at+interval '${OUTBOX_LIMITS.lifetimeHours} hours'<=clock_timestamp() THEN 'dead_letter' ELSE 'pendente' END,
      delivered_at=CASE WHEN $4 AND (${authorized}) THEN clock_timestamp() ELSE NULL END,
      failure_code=CASE WHEN NOT (${authorized}) THEN 'subscription_or_event_changed' WHEN $4 THEN NULL ELSE 'delivery_failed' END,
      available_at=clock_timestamp()+make_interval(secs => LEAST(3600,30*power(2,tentativas-1))*(0.5+random()*0.5)),
      lease_owner=NULL,lease_until=NULL
      WHERE id=$1 AND lease_owner=$2 AND tentativas=$3 AND estado='pendente' AND lease_until>clock_timestamp() RETURNING id`,
      [row.id, row.claim, row.attempts, delivered],
    );
    return result.rowCount === 1;
  }
}
