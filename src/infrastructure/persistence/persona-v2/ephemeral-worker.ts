import type pg from "pg";
import type {
  EphemeralCleanupCounts,
  PersonaEphemeralWorkerPort,
} from "../../../domain/ports/persona-ephemeral-worker.port.js";
import {
  EPHEMERAL_CLEANUP_BATCH_SIZE,
  EPHEMERAL_WORKER_LEASE_MS,
} from "../../../application/persona-v2/ephemeral-worker.js";
import { claimWorkerLease } from "./worker-lease.js";

// Closed internal inventory: neither table names nor predicates come from consumers.
const expiryTables = [
  ["setups", "setup_v2", "code_hash"],
  ["oauthRecords", "oauth_registro_v2", "id_hash"],
  ["publicationPreviews", "publicacao_preview_v2", "hash"],
  ["structurePreviews", "structure_preview_v2", "hash"],
  ["physicalPreviews", "physical_profile_preview_v2", "hash"],
  ["knowledgeCurationPreviews", "knowledge_curation_preview_v2", "hash"],
  ["physicalCurationPreviews", "physical_curation_preview_v2", "hash"],
  ["interactionTexts", "interaction_error_text_v2", "id"],
  ["attachments", "persona_attachment_v2", "handle_hash"],
] as const;

export class PostgresPersonaEphemeralWorker implements PersonaEphemeralWorkerPort {
  constructor(private readonly pool: pg.Pool) {}

  async claim(owner: string, now: Date, leaseUntil: Date): Promise<boolean> {
    return claimWorkerLease(this.pool, {
      table: "persona_ephemeral_worker_lease_v2",
      name: "ephemeral-cleanup",
      owner,
      now,
      until: leaseUntil,
      maxDurationMs: EPHEMERAL_WORKER_LEASE_MS,
    });
  }

  async release(owner: string): Promise<void> {
    await this.pool.query(
      "DELETE FROM persona_ephemeral_worker_lease_v2 WHERE name='ephemeral-cleanup' AND owner=$1",
      [owner],
    );
  }

  async process(owner: string, now: Date): Promise<EphemeralCleanupCounts> {
    const db = await this.pool.connect();
    try {
      await db.query("BEGIN");
      if (
        (
          await db.query(
            "SELECT name FROM persona_ephemeral_worker_lease_v2 WHERE name='ephemeral-cleanup' AND owner=$1 AND expires_at>clock_timestamp() FOR UPDATE",
            [owner],
          )
        ).rowCount !== 1
      ) {
        throw new Error("Ephemeral worker lease expired.");
      }
      const counts: EphemeralCleanupCounts = {
        setups: 0,
        oauthRecords: 0,
        publicationPreviews: 0,
        structurePreviews: 0,
        physicalPreviews: 0,
        knowledgeCurationPreviews: 0,
        physicalCurationPreviews: 0,
        reviewBindings: 0,
        interactionTexts: 0,
        attachments: 0,
        outboxMetadata: 0,
      };
      for (const [key, table, id] of expiryTables) {
        // Spent codes/refresh tokens still identify an active family after their own expiry.
        const familyGuard =
          key === "oauthRecords"
            ? `AND (concessao_id IS NULL OR EXISTS
                (SELECT 1 FROM oauth_concessao_v2 g WHERE g.persona_id=${table}.persona_id
                 AND g.id=${table}.concessao_id AND g.expires_at<=LEAST($1::timestamptz,clock_timestamp())))`
            : "";
        const result = await db.query(
          `DELETE FROM ${table} WHERE ${id} IN
           (SELECT ${id} FROM ${table} WHERE expires_at<=LEAST($1::timestamptz,clock_timestamp())
            ${familyGuard}
            ORDER BY expires_at,${id} LIMIT $2 FOR UPDATE SKIP LOCKED)`,
          [now, EPHEMERAL_CLEANUP_BATCH_SIZE],
        );
        counts[key] = result.rowCount ?? 0;
      }
      const bindings = await db.query(
        `DELETE FROM knowledge_review_preview_v2 WHERE hash IN
         (SELECT r.hash FROM knowledge_review_preview_v2 r
          WHERE NOT EXISTS(SELECT 1 FROM publicacao_preview_v2 p WHERE p.hash=r.hash)
            AND NOT EXISTS(SELECT 1 FROM structure_preview_v2 p WHERE p.hash=r.hash)
            AND NOT EXISTS(SELECT 1 FROM physical_profile_preview_v2 p WHERE p.hash=r.hash)
          ORDER BY r.hash LIMIT $1 FOR UPDATE OF r SKIP LOCKED)`,
        [EPHEMERAL_CLEANUP_BATCH_SIZE],
      );
      counts.reviewBindings = bindings.rowCount ?? 0;
      const notifications = await db.query(
        `UPDATE outbox_v2 SET metadata='{}',destino_enc=NULL,segredo_enc=NULL,
          metadata_removed_at=clock_timestamp()
         WHERE id IN (SELECT id FROM outbox_v2
          WHERE notification_version IS NOT NULL AND estado<>'pendente'
           AND metadata_removed_at IS NULL
           AND terminal_recorded_at<=clock_timestamp()-interval '90 days'
          ORDER BY terminal_recorded_at,id LIMIT $1 FOR UPDATE SKIP LOCKED)`,
        [EPHEMERAL_CLEANUP_BATCH_SIZE],
      );
      counts.outboxMetadata = notifications.rowCount ?? 0;
      if (
        (
          await db.query(
            "SELECT name FROM persona_ephemeral_worker_lease_v2 WHERE name='ephemeral-cleanup' AND owner=$1 AND expires_at>clock_timestamp()",
            [owner],
          )
        ).rowCount !== 1
      ) {
        throw new Error("Ephemeral worker lease expired before commit.");
      }
      await db.query("COMMIT");
      return counts;
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    } finally {
      db.release();
    }
  }
}
