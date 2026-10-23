import type pg from "pg";
import type {
  OperationRetentionCounts,
  PersonaRetentionWorkerPort,
} from "../../../domain/ports/persona-retention-worker.port.js";
import {
  RETENTION_BATCH_SIZE,
  RETENTION_WORKER_LEASE_MS,
} from "../../../application/persona-v2/retention-worker.js";
import { claimWorkerLease } from "./worker-lease.js";

export class PostgresPersonaRetentionWorker implements PersonaRetentionWorkerPort {
  constructor(private readonly pool: pg.Pool) {}
  async claim(owner: string, now: Date, until: Date): Promise<boolean> {
    return claimWorkerLease(this.pool, {
      table: "persona_retention_worker_lease_v2",
      name: "operation-retention",
      owner,
      now,
      until,
      maxDurationMs: RETENTION_WORKER_LEASE_MS,
    });
  }
  async release(owner: string): Promise<void> {
    await this.pool.query(
      "DELETE FROM persona_retention_worker_lease_v2 WHERE name='operation-retention' AND owner=$1",
      [owner],
    );
  }
  async process(owner: string, now: Date): Promise<OperationRetentionCounts> {
    const db = await this.pool.connect();
    try {
      await db.query("BEGIN");
      if (
        (
          await db.query(
            "SELECT name FROM persona_retention_worker_lease_v2 WHERE name='operation-retention' AND owner=$1 AND expires_at>clock_timestamp() FOR UPDATE",
            [owner],
          )
        ).rowCount !== 1
      ) {
        throw new Error("Retention worker lease expired.");
      }
      const counts: OperationRetentionCounts = {
        sqlPayloads: 0,
        externalPayloads: 0,
        sqlReceipts: 0,
        externalReceipts: 0,
      };
      for (const [table, payloadKey, receiptKey, states, extraResult] of [
        [
          "operacao_v2",
          "sqlPayloads",
          "sqlReceipts",
          "'concluida','rollback_confirmado','cancelada','recusada','expirada'",
          false,
        ],
        [
          "external_action_v2",
          "externalPayloads",
          "externalReceipts",
          "'concluida','cancelada','recusada','expirada'",
          true,
        ],
      ] as const) {
        const payload = await db.query(
          `UPDATE ${table} SET payload_enc=NULL,${extraResult ? "result_enc=NULL," : ""}versao=versao+1
           WHERE id IN (SELECT id FROM ${table} WHERE estado IN (${states})
             AND terminal_at IS NOT NULL AND terminal_at+interval '24 hours'<=LEAST($1::timestamptz,clock_timestamp())
             AND payload_purge_at<=LEAST($1::timestamptz,clock_timestamp())
             AND (payload_enc IS NOT NULL${extraResult ? " OR result_enc IS NOT NULL" : ""})
             ORDER BY terminal_at,id LIMIT $2 FOR UPDATE SKIP LOCKED)`,
          [now, RETENTION_BATCH_SIZE],
        );
        counts[payloadKey] = payload.rowCount ?? 0;
        const receipt = await db.query(
          `UPDATE ${table} SET comprovante=NULL,versao=versao+1 WHERE id IN
            (SELECT id FROM ${table} WHERE estado IN (${states}) AND terminal_at IS NOT NULL
             AND terminal_at+interval '90 days'<=LEAST($1::timestamptz,clock_timestamp())
             AND comprovante IS NOT NULL AND payload_enc IS NULL${extraResult ? " AND result_enc IS NULL" : ""}
             ORDER BY terminal_at,id LIMIT $2 FOR UPDATE SKIP LOCKED)`,
          [now, RETENTION_BATCH_SIZE],
        );
        counts[receiptKey] = receipt.rowCount ?? 0;
      }
      if (
        (
          await db.query(
            "SELECT name FROM persona_retention_worker_lease_v2 WHERE name='operation-retention' AND owner=$1 AND expires_at>clock_timestamp()",
            [owner],
          )
        ).rowCount !== 1
      ) {
        throw new Error("Retention worker lease expired before commit.");
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
