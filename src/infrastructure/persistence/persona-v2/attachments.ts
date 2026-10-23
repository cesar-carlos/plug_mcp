import type pg from "pg";
import type { CryptoPort } from "../../../domain/ports/crypto.port.js";
import type { PersonaAttachmentStore } from "../../../domain/ports/persona-attachment.port.js";
import {
  attachmentHandleSchema,
  ATTACHMENT_MAX_TTL_MS,
} from "../../../domain/persona-v2/attachments.js";
import { PersonaV2Error } from "../../../domain/persona-v2/model.js";

const MAX_PAYLOAD_BYTES = 24 * 1024 * 1024;
const unavailable = () =>
  new PersonaV2Error("CAPABILITY_UNAVAILABLE", "Armazenamento do anexo indisponível.");

/** The control DB stores only hashes and sealed operational content, never raw handles. */
export class PostgresPersonaAttachments implements PersonaAttachmentStore {
  readonly storage = "shared-postgres";
  private closed = false;
  private readonly namespace: string;
  constructor(
    private readonly pool: pg.Pool,
    private readonly crypto: CryptoPort,
    publicBaseUrl: string,
  ) {
    this.namespace = crypto.sha256Hex(`persona-v2-attachments-v1:${new URL(publicBaseUrl).origin}`);
  }

  async put(binding: string, plaintext: string, expiresAt: number): Promise<string> {
    if (this.closed) {
      throw unavailable();
    }
    if (
      Buffer.byteLength(plaintext, "utf8") > MAX_PAYLOAD_BYTES ||
      !Number.isSafeInteger(expiresAt) ||
      expiresAt <= Date.now() ||
      expiresAt > Date.now() + ATTACHMENT_MAX_TTL_MS
    ) {
      throw new PersonaV2Error("BUDGET_EXCEEDED", "Conteúdo ou validade do anexo excede o limite.");
    }
    const handle = attachmentHandleSchema.parse(this.crypto.randomToken(32));
    const handleHash = this.crypto.sha256Hex(handle);
    const scope = this.crypto.sha256Hex(binding);
    const payload = this.crypto.encrypt(
      JSON.stringify({
        version: 2,
        namespace: this.namespace,
        handleHash,
        scope,
        expiresAt,
        plaintext,
      }),
    );
    const db = await this.pool.connect().catch(() => {
      throw unavailable();
    });
    try {
      await db.query("BEGIN");
      await db.query("SET LOCAL statement_timeout='5s'");
      await db.query("SET LOCAL lock_timeout='5s'");
      await db.query(
        `INSERT INTO persona_attachment_v2(handle_hash,namespace,scope_hash,expires_at,payload_enc)
         VALUES($1,$2,$3,$4,$5)`,
        [handleHash, this.namespace, scope, new Date(expiresAt), payload],
      );
      if (this.closed || expiresAt <= Date.now()) {
        throw unavailable();
      }
      await db.query("COMMIT");
    } catch (error) {
      await db.query("ROLLBACK");
      if ((error as { code?: string }).code === "PAV01") {
        throw new PersonaV2Error(
          "BUDGET_EXCEEDED",
          "Quota de anexos atingida; aguarde limpeza dos expirados.",
        );
      }
      throw unavailable();
    } finally {
      db.release();
    }
    if (this.closed) {
      await this.remove(handle, binding);
      throw unavailable();
    }
    return handle;
  }

  async get(handle: string, binding: string): Promise<string | null> {
    if (this.closed || !attachmentHandleSchema.safeParse(handle).success) {
      return null;
    }
    const handleHash = this.crypto.sha256Hex(handle),
      scope = this.crypto.sha256Hex(binding);
    const result = await this.pool
      .query<{ payload_enc: string; expires_at: Date }>(
        `SELECT payload_enc,expires_at FROM persona_attachment_v2
       WHERE handle_hash=$1 AND namespace=$2 AND scope_hash=$3 AND expires_at>clock_timestamp()`,
        [handleHash, this.namespace, scope],
      )
      .catch(() => {
        throw unavailable();
      });
    const row = result.rows[0];
    if (!row || this.closed) {
      return null;
    }
    try {
      const envelope = JSON.parse(this.crypto.decrypt(row.payload_enc)) as Record<string, unknown>;
      if (
        envelope.version !== 2 ||
        envelope.namespace !== this.namespace ||
        envelope.handleHash !== handleHash ||
        envelope.scope !== scope ||
        envelope.expiresAt !== row.expires_at.getTime() ||
        row.expires_at.getTime() <= Date.now() ||
        typeof envelope.plaintext !== "string" ||
        Buffer.byteLength(envelope.plaintext, "utf8") > MAX_PAYLOAD_BYTES
      ) {
        throw unavailable();
      }
      return envelope.plaintext;
    } catch {
      // A misconfigured instance must not destroy another instance's recoverable ciphertext.
      return null;
    }
  }

  async remove(handle: string, binding: string): Promise<void> {
    if (!attachmentHandleSchema.safeParse(handle).success) {
      return;
    }
    await this.pool
      .query(
        "DELETE FROM persona_attachment_v2 WHERE handle_hash=$1 AND namespace=$2 AND scope_hash=$3",
        [this.crypto.sha256Hex(handle), this.namespace, this.crypto.sha256Hex(binding)],
      )
      .catch(() => {
        throw unavailable();
      });
  }

  close(): void {
    // Other instances and subsequent starts retain the original, unextended deadline.
    this.closed = true;
  }
}
