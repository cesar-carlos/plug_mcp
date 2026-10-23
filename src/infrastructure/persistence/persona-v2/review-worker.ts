import type pg from "pg";
import { randomUUID } from "node:crypto";
import type { ReviewWorkerPort } from "../../../domain/ports/review-worker.port.js";
import { REVIEW_WORKER_LEASE_MS } from "../../../application/persona-v2/review-worker.js";
import { claimWorkerLease } from "./worker-lease.js";
const available = `((r.kind='privado' AND EXISTS(SELECT 1 FROM publicacao p JOIN persona a ON a.id=p.persona_id WHERE p.id=r.publication_id AND a.ativa AND NOT EXISTS(SELECT 1 FROM publicacao_suspensao s WHERE s.publicacao_id=p.id)))
 OR (r.kind='padrao' AND NOT EXISTS(SELECT 1 FROM structure_suspension_v2 s WHERE s.publicacao_id=r.publication_id))
 OR (r.kind='perfil' AND EXISTS(SELECT 1 FROM physical_profile_publication_v2 p WHERE p.id=r.publication_id AND NOT EXISTS(SELECT 1 FROM physical_profile_suspension_v2 ps WHERE ps.publication_id=p.id) AND NOT EXISTS(SELECT 1 FROM structure_suspension_v2 s WHERE s.publicacao_id=p.base_publication_id))))`;
export class PostgresReviewWorker implements ReviewWorkerPort {
  constructor(private readonly pool: pg.Pool) {}
  async claim(owner: string, now: Date, leaseUntil: Date): Promise<boolean> {
    return claimWorkerLease(this.pool, {
      table: "persona_review_worker_lease_v2",
      name: "knowledge-review",
      owner,
      now,
      until: leaseUntil,
      maxDurationMs: REVIEW_WORKER_LEASE_MS,
    });
  }
  async release(owner: string): Promise<void> {
    await this.pool.query(
      "DELETE FROM persona_review_worker_lease_v2 WHERE name='knowledge-review' AND owner=$1",
      [owner],
    );
  }
  async process(owner: string, _now: Date): Promise<{ created: number; closed: number }> {
    const db = await this.pool.connect();
    try {
      await db.query("BEGIN");
      const lease = await db.query(
        "SELECT name FROM persona_review_worker_lease_v2 WHERE name='knowledge-review' AND owner=$1 AND expires_at>clock_timestamp() FOR UPDATE",
        [owner],
      );
      if (lease.rowCount !== 1) {
        throw new Error("Review worker lease expired.");
      }
      const cutoff = (await db.query<{ cutoff: Date }>("SELECT clock_timestamp() AS cutoff"))
        .rows[0]!.cutoff;
      const closed = await db.query(
        `UPDATE knowledge_review_task_v2 SET closed_at=$1 WHERE id IN (SELECT t.id FROM knowledge_review_task_v2 t WHERE t.closed_at IS NULL AND NOT EXISTS(SELECT 1 FROM knowledge_review_v2 r WHERE r.kind=t.kind AND r.publication_id=t.publication_id AND r.version=t.calendar_version AND r.due_at<=$1 AND ${available}) ORDER BY t.id LIMIT 100 FOR UPDATE OF t SKIP LOCKED)`,
        [cutoff],
      );
      const due = await db.query<{
        kind: string;
        publication_id: string;
        version: number;
        due_at: Date;
      }>(
        `SELECT r.kind,r.publication_id,r.version,r.due_at FROM knowledge_review_v2 r
        WHERE r.due_at<=$1 AND ${available} AND NOT EXISTS(SELECT 1 FROM knowledge_review_task_v2 t WHERE t.kind=r.kind AND t.publication_id=r.publication_id AND t.calendar_version=r.version)
        ORDER BY r.due_at,r.kind,r.publication_id LIMIT 100 FOR SHARE OF r SKIP LOCKED`,
        [cutoff],
      );
      let created = 0;
      for (const r of due.rows) {
        const taskId = randomUUID();
        const task = await db.query(
          "INSERT INTO knowledge_review_task_v2(id,kind,publication_id,calendar_version,due_at,created_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(kind,publication_id,calendar_version) DO NOTHING RETURNING id",
          [taskId, r.kind, r.publication_id, r.version, r.due_at, cutoff],
        );
        if (task.rowCount === 1) {
          await db.query(
            "INSERT INTO knowledge_review_notification_v2(task_id,created_at) VALUES($1,$2)",
            [taskId, cutoff],
          );
          created++;
        }
      }
      if (
        (
          await db.query(
            "SELECT name FROM persona_review_worker_lease_v2 WHERE name='knowledge-review' AND owner=$1 AND expires_at>clock_timestamp()",
            [owner],
          )
        ).rowCount !== 1
      ) {
        throw new Error("Review worker lease expired before commit.");
      }
      await db.query("COMMIT");
      return { created, closed: closed.rowCount ?? 0 };
    } catch (e) {
      await db.query("ROLLBACK");
      throw e;
    } finally {
      db.release();
    }
  }
}
