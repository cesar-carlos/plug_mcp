import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { AnexoHandlePort } from "../../domain/ports/anexo-handle.port.js";
import type { AnexoPutInput, AnexoRecord } from "../../domain/entities/anexo.js";
import { ANEXO_HANDLE_MAX_PER_USER, ANEXO_HANDLE_TTL_MS } from "../../domain/entities/anexo.js";
import { DomainError } from "../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../domain/errors/error-codes.js";

const HMAC_CHARS = 32;

const hmacOf = (secret: string, id: string, usuarioId: string): string =>
  createHmac("sha256", secret)
    .update(`${id}:${usuarioId}`)
    .digest("base64url")
    .slice(0, HMAC_CHARS);

const equalHmac = (left: string, right: string): boolean => {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
};

/**
 * Handle opaco HMAC+TTL+usuarioId. Buffer só em memória (não Redis).
 * Uma instância do processo — handles morrem no restart.
 */
export class MemoryAnexoHandleStore implements AnexoHandlePort {
  private readonly records = new Map<string, AnexoRecord>();

  constructor(
    private readonly secret: string,
    private readonly ttlMs: number = ANEXO_HANDLE_TTL_MS,
    private readonly now: () => number = Date.now,
    private readonly quotas: { acessoBytes: number; processoBytes: number } = {
      acessoBytes: 32 * 1024 * 1024,
      processoBytes: 128 * 1024 * 1024,
    },
  ) {}

  put(input: AnexoPutInput): string {
    this.sweep();
    let total = 0,
      access = 0;
    for (const record of this.records.values()) {
      total += record.bytes.byteLength;
      if (record.acessoId === input.acessoId) {
        access += record.bytes.byteLength;
      }
    }
    if (
      total + input.bytes.byteLength > this.quotas.processoBytes ||
      access + input.bytes.byteLength > this.quotas.acessoBytes
    ) {
      throw DomainError.anexo({
        code: ERROR_CODES.CONSULTA_ORCAMENTO,
        message: "Orçamento de anexos em memória excedido.",
        hint: "Aguarde a expiração dos handles ou reduza a quantidade e o tamanho dos anexos.",
      });
    }
    const idsDoUsuario: string[] = [];
    for (const [id, record] of this.records) {
      if (record.usuarioId === input.usuarioId) {
        idsDoUsuario.push(id);
      }
    }
    while (idsDoUsuario.length >= ANEXO_HANDLE_MAX_PER_USER) {
      const oldest = idsDoUsuario.shift();
      if (oldest === undefined) {
        break;
      }
      this.records.delete(oldest);
    }
    const id = randomUUID();
    const createdAt = this.now();
    this.records.set(id, {
      proveniencia: input.proveniencia ? structuredClone(input.proveniencia) : undefined,
      usuarioId: input.usuarioId,
      acessoId: input.acessoId,
      bytes: Uint8Array.from(input.bytes),
      mimeHint: input.mimeHint,
      coluna: input.coluna,
      sensibilidade: input.sensibilidade,
      origem: input.origem,
      createdAt,
      expiresAt: createdAt + this.ttlMs,
    });
    return `${id}.${hmacOf(this.secret, id, input.usuarioId)}`;
  }

  get(handle: string, usuarioId: string): AnexoRecord | null {
    this.sweep();
    const trimmed = handle.trim();
    const dot = trimmed.lastIndexOf(".");
    if (dot <= 0) {
      return null;
    }
    const id = trimmed.slice(0, dot);
    const mac = trimmed.slice(dot + 1);
    if (!equalHmac(mac, hmacOf(this.secret, id, usuarioId))) {
      return null;
    }
    const record = this.records.get(id);
    if (record?.usuarioId !== usuarioId) {
      return null;
    }
    if (record.expiresAt <= this.now()) {
      this.records.delete(id);
      return null;
    }
    return {
      ...record,
      bytes: Uint8Array.from(record.bytes),
      proveniencia: record.proveniencia ? structuredClone(record.proveniencia) : undefined,
    };
  }

  invalidateAcesso(acessoId: string): void {
    for (const [id, record] of this.records) {
      if (record.acessoId === acessoId) {
        this.records.delete(id);
      }
    }
  }

  private sweep(): void {
    const now = this.now();
    for (const [id, record] of this.records) {
      if (record.expiresAt <= now) {
        this.records.delete(id);
      }
    }
  }
}
