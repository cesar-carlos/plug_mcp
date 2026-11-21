import { createHmac, randomUUID, randomBytes } from "node:crypto";
import type pg from "pg";
import type { CryptoPort } from "../../../domain/ports/crypto.port.js";
import { PersonaV2Error } from "../../../domain/persona-v2/model.js";
import { markCleanupFailure } from "../../../domain/errors/cleanup-failure.js";
import {
  pdfFailureDiagnosticSchema,
  type PdfFailureDiagnostic,
} from "../../../domain/persona-v2/pdf-renderer-failure.js";

import type { PdfJobRow, PdfReportJobsPort } from "../../../domain/ports/persona-pdf-jobs.port.js";
const unavailable = () => new PersonaV2Error("ATTACHMENT_UNAVAILABLE", "Relatório indisponível.");
const storageFailure = () =>
  new PersonaV2Error(
    "CAPABILITY_UNAVAILABLE",
    "Armazenamento de relatórios indisponível. Não repita a consulta.",
  );

/** Durable SQL dispatch exclusion. Only rendering may reclaim a complete capture. */
export class PostgresPdfReportJobs implements PdfReportJobsPort {
  private readonly namespace: string;
  constructor(
    private readonly pool: pg.Pool,
    private readonly crypto: CryptoPort,
    origin: string,
  ) {
    this.namespace = crypto.sha256Hex(`persona-v2-attachments-v1:${new URL(origin).origin}`);
  }
  private async transaction<T>(action: (db: pg.PoolClient) => Promise<T>): Promise<T> {
    let db: pg.PoolClient;
    try {
      db = await this.pool.connect();
    } catch {
      throw storageFailure();
    }
    let discarded = false;
    try {
      await db.query("BEGIN");
      await db.query("SET LOCAL statement_timeout='5s'");
      await db.query("SET LOCAL lock_timeout='5s'");
      const result = await action(db);
      await db.query("COMMIT");
      return result;
    } catch (error) {
      const failure =
        error instanceof PersonaV2Error
          ? error
          : (error as { code?: string } | null)?.code === "PAV01"
            ? new PersonaV2Error("BUDGET_EXCEEDED", "Quota de relatórios atingida.")
            : storageFailure();
      try {
        await db.query("ROLLBACK");
      } catch {
        discarded = true;
        db.release(true);
        throw markCleanupFailure(failure);
      }
      throw failure;
    } finally {
      if (!discarded) db.release();
    }
  }
  async admit(input: {
    personaId: string;
    tokenId: string;
    binding: string;
    requestId: string;
    requestJson: string;
    authorityJson?: string;
    timeoutMs: number;
    ttlMs: number;
    authorityExpiresAt: number;
  }): Promise<{ row: PdfJobRow; created: boolean }> {
    if (
      Buffer.byteLength(input.requestJson) > 1024 * 1024 ||
      input.timeoutMs <= 0 ||
      input.ttlMs <= 0
    )
      throw unavailable();
    return this.transaction(async (db) => {
      await db.query("SELECT pg_advisory_xact_lock(19370060)");
      const scope = this.crypto.sha256Hex(input.binding);
      const request = this.crypto.sha256Hex(input.requestId);
      const existing = (
        await db.query<PdfJobRow>(
          "SELECT * FROM persona_pdf_job_v2 WHERE namespace=$1 AND scope_hash=$2 AND request_hash=$3 FOR UPDATE",
          [this.namespace, scope, request],
        )
      ).rows[0];
      if (existing) {
        if (
          existing.request_key_enc &&
          createHmac("sha256", this.crypto.decrypt(existing.request_key_enc))
            .update(input.requestJson)
            .digest("hex") !== existing.request_fingerprint
        ) {
          throw new PersonaV2Error("INVALID_PLAN", "Identificador de tentativa já utilizado.");
        }
        return { row: existing, created: false };
      }
      const now = (
        await db.query<{ now: Date }>("SELECT clock_timestamp() AS now")
      ).rows[0]!.now.getTime();
      const until = Math.min(now + Math.min(900000, input.ttlMs), input.authorityExpiresAt);
      const deadline = Math.min(now + Math.min(60000, input.timeoutMs), until);
      if (!Number.isFinite(until) || deadline <= now) throw unavailable();
      const key = randomBytes(32).toString("hex");
      const row = (
        await db.query<PdfJobRow>(
          `INSERT INTO persona_pdf_job_v2(id,persona_id,token_id,namespace,scope_hash,request_hash,request_fingerprint,
         request_key_enc,state,created_at,work_deadline,artifact_expires_at,payload_enc,result_enc)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,'accepted',$9,$10,$11,$12,$13) RETURNING *`,
          [
            randomUUID(),
            input.personaId,
            input.tokenId,
            this.namespace,
            scope,
            request,
            createHmac("sha256", key).update(input.requestJson).digest("hex"),
            this.crypto.encrypt(key),
            new Date(now),
            new Date(deadline),
            new Date(until),
            this.crypto.encrypt(input.requestJson),
            input.authorityJson ? this.crypto.encrypt(input.authorityJson) : null,
          ],
        )
      ).rows[0]!;
      return { row, created: true };
    });
  }
  async get(id: string, binding: string): Promise<PdfJobRow | null> {
    try {
      return (
        (
          await this.pool.query<PdfJobRow>(
            "SELECT * FROM persona_pdf_job_v2 WHERE id=$1 AND namespace=$2 AND scope_hash=$3",
            [id, this.namespace, this.crypto.sha256Hex(binding)],
          )
        ).rows[0] ?? null
      );
    } catch {
      throw storageFailure();
    }
  }
  async findRequest(requestId: string, binding: string): Promise<PdfJobRow | null> {
    try {
      return (
        (
          await this.pool.query<PdfJobRow>(
            "SELECT * FROM persona_pdf_job_v2 WHERE namespace=$1 AND scope_hash=$2 AND request_hash=$3",
            [this.namespace, this.crypto.sha256Hex(binding), this.crypto.sha256Hex(requestId)],
          )
        ).rows[0] ?? null
      );
    } catch {
      throw storageFailure();
    }
  }
  async listCandidates(binding: string): Promise<PdfJobRow[]> {
    try {
      // Persona quota is 1000 tombstones. Do not read captured rows or apply user pagination here.
      const rows = (
        await this.pool.query<PdfJobRow>(
          `SELECT id,state,work_deadline,artifact_expires_at,result_enc,support_id FROM persona_pdf_job_v2
         WHERE namespace=$1 AND scope_hash=$2 AND result_enc IS NOT NULL AND artifact_expires_at>clock_timestamp()
         ORDER BY created_at DESC,id DESC LIMIT 1001`,
          [this.namespace, this.crypto.sha256Hex(binding)],
        )
      ).rows;
      if (rows.length > 1000) throw storageFailure();
      return rows;
    } catch {
      throw storageFailure();
    }
  }
  async startCapture(id: string, binding: string): Promise<boolean> {
    return this.transaction(
      async (db) =>
        (
          await db.query(
            `UPDATE persona_pdf_job_v2 SET state='collecting' WHERE id=$1 AND namespace=$2 AND scope_hash=$3
       AND state='accepted' AND work_deadline>clock_timestamp() RETURNING id`,
            [id, this.namespace, this.crypto.sha256Hex(binding)],
          )
        ).rowCount === 1,
    );
  }
  async sealCapture(id: string, binding: string, payload: string): Promise<void> {
    if (Buffer.byteLength(payload) > 16 * 1024 * 1024)
      throw new PersonaV2Error("BUDGET_EXCEEDED", "Captura excede o limite.");
    await this.transaction(async (db) => {
      const result = await db.query(
        `UPDATE persona_pdf_job_v2 SET state='captured',payload_enc=$4 WHERE id=$1 AND namespace=$2 AND scope_hash=$3
         AND state='collecting' AND work_deadline>clock_timestamp() RETURNING id`,
        [id, this.namespace, this.crypto.sha256Hex(binding), this.crypto.encrypt(payload)],
      );
      if (result.rowCount !== 1) throw unavailable();
    });
  }
  async claimRender(): Promise<PdfJobRow | null> {
    return this.transaction(async (db) => {
      await db.query("SELECT pg_advisory_xact_lock(19370061)");
      const active = await db.query(
        "SELECT id FROM persona_pdf_job_v2 WHERE namespace=$1 AND state='rendering' AND lease_until>clock_timestamp() AND work_deadline>clock_timestamp() LIMIT 1",
        [this.namespace],
      );
      if (active.rowCount) return null;
      const row = (
        await db.query<PdfJobRow>(
          `SELECT * FROM persona_pdf_job_v2 WHERE namespace=$1 AND work_deadline>clock_timestamp()
         AND payload_enc IS NOT NULL AND render_attempts<2 AND
         (state='captured' OR (state='rendering' AND lease_until<clock_timestamp()))
         ORDER BY work_deadline,id FOR UPDATE SKIP LOCKED LIMIT 1`,
          [this.namespace],
        )
      ).rows[0];
      if (!row) return null;
      return (
        await db.query<PdfJobRow>(
          `UPDATE persona_pdf_job_v2 SET state='rendering',render_token=$2,render_attempts=render_attempts+1,
         lease_until=LEAST(work_deadline,clock_timestamp()+interval '15 seconds') WHERE id=$1 RETURNING *`,
          [row.id, randomUUID()],
        )
      ).rows[0]!;
    });
  }
  decode(row: PdfJobRow): string {
    if (!row.payload_enc) throw unavailable();
    return this.crypto.decrypt(row.payload_enc);
  }
  decodeResult(row: PdfJobRow): string {
    if (!row.result_enc) throw unavailable();
    return this.crypto.decrypt(row.result_enc);
  }
  private failureResult(
    row: PdfJobRow | undefined,
    diagnostic?: PdfFailureDiagnostic,
  ): string | null {
    if (!row?.result_enc) return null;
    const authority = JSON.parse(this.crypto.decrypt(row.result_enc)) as Record<string, unknown>;
    return this.crypto.encrypt(
      JSON.stringify({
        ...authority,
        ...(diagnostic ? { failure: pdfFailureDiagnosticSchema.parse(diagnostic) } : {}),
      }),
    );
  }
  async failCapture(
    id: string,
    binding: string,
    supportId: string,
    diagnostic?: PdfFailureDiagnostic,
  ): Promise<void> {
    await this.transaction(async (db) => {
      const row = (
        await db.query<PdfJobRow>(
          "SELECT * FROM persona_pdf_job_v2 WHERE id=$1 AND namespace=$2 AND scope_hash=$3 AND state='collecting' FOR UPDATE",
          [id, this.namespace, this.crypto.sha256Hex(binding)],
        )
      ).rows[0];
      if (!row) return;
      await db.query(
        `UPDATE persona_pdf_job_v2 SET state='capture_unconfirmed',support_id=$4,payload_enc=NULL,request_key_enc=NULL,result_enc=$5
        WHERE id=$1 AND namespace=$2 AND scope_hash=$3 AND state='collecting'`,
        [
          id,
          this.namespace,
          this.crypto.sha256Hex(binding),
          supportId,
          this.failureResult(row, diagnostic),
        ],
      );
    });
  }
  async failRender(
    id: string,
    renderToken: string,
    supportId: string,
    diagnostic?: PdfFailureDiagnostic,
  ): Promise<void> {
    await this.transaction(async (db) => {
      const row = (
        await db.query<PdfJobRow>(
          "SELECT * FROM persona_pdf_job_v2 WHERE id=$1 AND namespace=$2 AND state='rendering' AND render_token=$3 FOR UPDATE",
          [id, this.namespace, renderToken],
        )
      ).rows[0];
      if (!row) return;
      await db.query(
        `UPDATE persona_pdf_job_v2 SET state='failed',support_id=$4,payload_enc=NULL,request_key_enc=NULL,result_enc=$5,
        render_token=NULL,lease_until=NULL WHERE id=$1 AND namespace=$2 AND state='rendering' AND render_token=$3`,
        [id, this.namespace, renderToken, supportId, this.failureResult(row, diagnostic)],
      );
    });
  }
  async finish(
    id: string,
    renderToken: string,
    attachment: string,
    result: Record<string, unknown>,
  ): Promise<string> {
    if (Buffer.byteLength(attachment) > 24 * 1024 * 1024)
      throw new PersonaV2Error("BUDGET_EXCEEDED", "Relatório excede o limite.");
    return this.transaction(async (db) => {
      const row = (
        await db.query<PdfJobRow>(
          `SELECT * FROM persona_pdf_job_v2 WHERE id=$1 AND namespace=$2 AND state='rendering' AND render_token=$3
         AND lease_until>clock_timestamp() AND work_deadline>clock_timestamp() FOR UPDATE`,
          [id, this.namespace, renderToken],
        )
      ).rows[0];
      if (!row) throw unavailable();
      const handle = this.crypto.randomToken(32);
      const hash = this.crypto.sha256Hex(handle);
      const envelope = this.crypto.encrypt(
        JSON.stringify({
          version: 2,
          namespace: this.namespace,
          handleHash: hash,
          scope: row.scope_hash,
          expiresAt: row.artifact_expires_at.getTime(),
          plaintext: attachment,
        }),
      );
      await db.query(
        `INSERT INTO persona_attachment_v2(handle_hash,namespace,scope_hash,expires_at,payload_enc)
        VALUES($1,$2,$3,$4,$5)`,
        [hash, this.namespace, row.scope_hash, row.artifact_expires_at, envelope],
      );
      const storedResult = JSON.stringify({
        ...(row.result_enc
          ? (JSON.parse(this.crypto.decrypt(row.result_enc)) as Record<string, unknown>)
          : {}),
        ...result,
        handle,
      });
      await db.query(
        `UPDATE persona_pdf_job_v2 SET state='ready',artifact_hash=$2,result_enc=$3,payload_enc=NULL,
        render_token=NULL,lease_until=NULL WHERE id=$1`,
        [id, hash, this.crypto.encrypt(storedResult)],
      );
      await db.query(
        `INSERT INTO audit_v2(id,persona_id,token_id,evento,origem,sucesso,attachment_id)
        VALUES($1,$2,$3,'pdf_report_ready','worker',true,$4)`,
        [randomUUID(), row.persona_id, row.token_id, id],
      );
      return storedResult;
    });
  }
  async cancel(id: string, binding: string): Promise<void> {
    await this.transaction(async (db) => {
      const row = (
        await db.query<PdfJobRow>(
          "SELECT * FROM persona_pdf_job_v2 WHERE id=$1 AND namespace=$2 AND scope_hash=$3 FOR UPDATE",
          [id, this.namespace, this.crypto.sha256Hex(binding)],
        )
      ).rows[0];
      if (!row) throw unavailable();
      if (["cancelled", "expired", "failed", "capture_unconfirmed"].includes(row.state)) return;
      // Retain only authority until the original expiry, never a download handle.
      const authority = row.result_enc
        ? (JSON.parse(this.crypto.decrypt(row.result_enc)) as Record<string, unknown>)
        : null;
      const cancelledResult = authority
        ? this.crypto.encrypt(
            JSON.stringify({
              sourceId: authority.sourceId,
              skillId: authority.skillId,
              publicationId: authority.publicationId,
              ...(authority.additionalAuthorities
                ? { additionalAuthorities: authority.additionalAuthorities }
                : {}),
            }),
          )
        : null;
      if (row.artifact_hash)
        await db.query(
          "DELETE FROM persona_attachment_v2 WHERE handle_hash=$1 AND namespace=$2 AND scope_hash=$3",
          [row.artifact_hash, this.namespace, row.scope_hash],
        );
      await db.query(
        "UPDATE persona_pdf_job_v2 SET state='cancelled',payload_enc=NULL,result_enc=$2,request_key_enc=NULL,render_token=NULL,lease_until=NULL WHERE id=$1",
        [id, cancelledResult],
      );
    });
  }
  async expire(): Promise<number> {
    return this.transaction(async (db) => {
      const rows = (
        await db.query<PdfJobRow>(
          `SELECT * FROM persona_pdf_job_v2 WHERE namespace=$1 AND
       ((state IN ('accepted','collecting','captured','rendering') AND work_deadline<=clock_timestamp()) OR
        (state='ready' AND artifact_expires_at<=clock_timestamp()) OR
        (state IN ('failed','capture_unconfirmed','cancelled','expired') AND result_enc IS NOT NULL AND artifact_expires_at<=clock_timestamp())) ORDER BY work_deadline,id FOR UPDATE SKIP LOCKED LIMIT 32`,
          [this.namespace],
        )
      ).rows;
      for (const row of rows) {
        if (row.artifact_hash)
          await db.query(
            "DELETE FROM persona_attachment_v2 WHERE handle_hash=$1 AND namespace=$2",
            [row.artifact_hash, this.namespace],
          );
        await db.query(
          `UPDATE persona_pdf_job_v2 SET state=$2,payload_enc=NULL,result_enc=NULL,request_key_enc=NULL,
          render_token=NULL,lease_until=NULL,support_id=$3 WHERE id=$1`,
          [
            row.id,
            row.state === "collecting"
              ? "capture_unconfirmed"
              : ["failed", "capture_unconfirmed", "cancelled", "expired"].includes(row.state)
                ? row.state
                : "expired",
            row.support_id ?? randomUUID(),
          ],
        );
      }
      return rows.length;
    });
  }
}
