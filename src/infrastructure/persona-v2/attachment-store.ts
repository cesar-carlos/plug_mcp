import type { CryptoPort } from "../../domain/ports/crypto.port.js";
import type { PersonaAttachmentStore } from "../../domain/ports/persona-attachment.port.js";
import {
  attachmentHandleSchema,
  ATTACHMENT_MAX_TTL_MS,
} from "../../domain/persona-v2/attachments.js";
import { PersonaV2Error } from "../../domain/persona-v2/model.js";

const MAX_PROCESS_BYTES = 128 * 1024 * 1024;
const MAX_CONSUMER_BYTES = 32 * 1024 * 1024;
const MAX_CONSUMER_FILES = 8;
const MAX_FILES = 64;
const MAX_PAYLOAD_BYTES = 24 * 1024 * 1024;
export class PersonaMemoryAttachments implements PersonaAttachmentStore {
  readonly storage = "process-memory";
  private closed = false;
  private readonly records = new Map<
    string,
    { scope: string; cipher: string; expiresAt: number; bytes: number }
  >();
  private readonly timer: ReturnType<typeof setInterval>;
  constructor(
    private readonly crypto: CryptoPort,
    private readonly now: () => number = Date.now,
  ) {
    this.timer = setInterval(() => this.sweep(), 60000);
    this.timer.unref();
  }
  private sweep(): void {
    for (const [key, value] of this.records) {
      if (value.expiresAt <= this.now()) {
        this.records.delete(key);
      }
    }
  }
  put(binding: string, plaintext: string, expiresAt: number): string {
    if (this.closed) {
      throw new PersonaV2Error("ATTACHMENT_UNAVAILABLE", "Anexo indisponível.");
    }
    this.sweep();
    if (
      Buffer.byteLength(plaintext, "utf8") > MAX_PAYLOAD_BYTES ||
      expiresAt <= this.now() ||
      expiresAt > this.now() + ATTACHMENT_MAX_TTL_MS
    ) {
      throw new PersonaV2Error("BUDGET_EXCEEDED", "Conteúdo ou validade do anexo excede o limite.");
    }
    const scope = this.crypto.sha256Hex(binding);
    const cipher = this.crypto.encrypt(JSON.stringify({ version: 1, scope, plaintext }));
    const bytes = Buffer.byteLength(cipher, "utf8");
    let total = bytes,
      own = bytes,
      count = 0;
    for (const value of this.records.values()) {
      total += value.bytes;
      if (value.scope === scope) {
        own += value.bytes;
        count++;
      }
    }
    if (
      total > MAX_PROCESS_BYTES ||
      own > MAX_CONSUMER_BYTES ||
      count >= MAX_CONSUMER_FILES ||
      this.records.size >= MAX_FILES
    ) {
      throw new PersonaV2Error(
        "BUDGET_EXCEEDED",
        "Quota de anexos atingida; aguarde expiração ou reduza a consulta.",
      );
    }
    const handle = this.crypto.randomToken(32);
    attachmentHandleSchema.parse(handle);
    this.records.set(this.crypto.sha256Hex(handle), { scope, cipher, expiresAt, bytes });
    return handle;
  }
  get(handle: string, binding: string): string | null {
    if (this.closed) {
      return null;
    }
    this.sweep();
    if (!attachmentHandleSchema.safeParse(handle).success) {
      return null;
    }
    const row = this.records.get(this.crypto.sha256Hex(handle));
    const scope = this.crypto.sha256Hex(binding);
    if (row?.scope !== scope) {
      return null;
    }
    try {
      const envelope = JSON.parse(this.crypto.decrypt(row.cipher)) as {
        version?: number;
        scope?: string;
        plaintext?: string;
      };
      return envelope.version === 1 &&
        envelope.scope === scope &&
        typeof envelope.plaintext === "string"
        ? envelope.plaintext
        : null;
    } catch {
      this.records.delete(this.crypto.sha256Hex(handle));
      return null;
    }
  }
  remove(handle: string, binding: string): void {
    const key = this.crypto.sha256Hex(handle),
      row = this.records.get(key);
    if (row?.scope === this.crypto.sha256Hex(binding)) {
      this.records.delete(key);
    }
  }
  close(): void {
    this.closed = true;
    clearInterval(this.timer);
    this.records.clear();
  }
}
