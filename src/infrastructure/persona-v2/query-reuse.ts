import { createHmac, randomUUID } from "node:crypto";
import type { CryptoPort } from "../../domain/ports/crypto.port.js";
import type {
  PersonaQueryReusePort,
  PersonaQueryReuseStore,
} from "../../domain/ports/persona-query-reuse.port.js";
import { PersonaV2Error } from "../../domain/persona-v2/model.js";

// Never reuse entries lacking authenticated creation time or binary type-system validation.
export const PERSONA_QUERY_REUSE_PREFIX = "se7e:persona-v2:query:v3:";
const MAX_INFLIGHT = 64;
const MAX_ENTRY_BYTES = 2 * 1024 * 1024;
const MAX_MEMORY_BYTES = 16 * 1024 * 1024;
const MAX_ENTRIES = 128;
export class PersonaMemoryQueryStore implements PersonaQueryReuseStore {
  private readonly entries = new Map<string, { value: string; until: number; bytes: number }>();
  private bytes = 0;
  get(key: string): Promise<string | null> {
    const entry = this.entries.get(key);
    if (!entry) {
      return Promise.resolve(null);
    }
    this.entries.delete(key);
    this.bytes -= entry.bytes;
    if (entry.until <= Date.now()) {
      return Promise.resolve(null);
    }
    this.entries.set(key, entry);
    this.bytes += entry.bytes;
    return Promise.resolve(entry.value);
  }
  claim(): Promise<boolean> {
    return Promise.resolve(true);
  }
  release(): Promise<void> {
    return Promise.resolve();
  }
  publish(key: string, _owner: string, value: string, ttlMs: number): Promise<boolean> {
    const bytes = Buffer.byteLength(value, "utf8");
    if (bytes > MAX_ENTRY_BYTES) {
      return Promise.resolve(false);
    }
    const old = this.entries.get(key);
    if (old) {
      this.entries.delete(key);
      this.bytes -= old.bytes;
    }
    while (this.entries.size >= MAX_ENTRIES || this.bytes + bytes > MAX_MEMORY_BYTES) {
      const first = this.entries.keys().next().value;
      if (first === undefined) {
        break;
      }
      this.bytes -= this.entries.get(first)!.bytes;
      this.entries.delete(first);
    }
    this.entries.set(key, { value, until: Date.now() + ttlMs, bytes });
    this.bytes += bytes;
    return Promise.resolve(true);
  }
}

interface Reused<T> {
  value: T;
  kind: "fresh" | "cache" | "singleflight";
}
export class PersonaQueryReuse implements PersonaQueryReusePort {
  private readonly inflight = new Map<string, Promise<Reused<unknown>>>();
  constructor(
    private readonly store: PersonaQueryReuseStore,
    private readonly crypto: CryptoPort,
    private readonly keySecret: string,
    private readonly namespace: string,
    private readonly ttlMs: number,
  ) {
    if (!Number.isInteger(ttlMs) || ttlMs < 1 || ttlMs > 60000) {
      throw new Error("Invalid v2 cache TTL");
    }
  }
  private key(material: string): string {
    return (
      PERSONA_QUERY_REUSE_PREFIX +
      createHmac("sha256", this.keySecret)
        .update(this.namespace)
        .update("\0")
        .update(material)
        .digest("hex")
    );
  }
  private deadline(at: number): void {
    if (Date.now() >= at) {
      throw new PersonaV2Error(
        "BUDGET_EXCEEDED",
        "Prazo de reutilização da consulta excedido; nenhuma nova execução foi enviada.",
      );
    }
  }
  private async read<T>(key: string): Promise<Reused<T> | null> {
    try {
      const cipher = await this.store.get(key);
      if (!cipher || Buffer.byteLength(cipher, "utf8") > MAX_ENTRY_BYTES) {
        return null;
      }
      const envelope = JSON.parse(this.crypto.decrypt(cipher)) as {
        key?: string;
        version?: number;
        createdAt?: number;
        until?: number;
        value?: T;
      };
      const now = Date.now();
      if (
        envelope.key !== key ||
        envelope.version !== 2 ||
        typeof envelope.createdAt !== "number" ||
        !Number.isSafeInteger(envelope.createdAt) ||
        typeof envelope.until !== "number" ||
        !Number.isSafeInteger(envelope.until) ||
        envelope.createdAt > now ||
        now - envelope.createdAt >= this.ttlMs ||
        envelope.until <= envelope.createdAt ||
        envelope.until - envelope.createdAt > 60000 ||
        envelope.until <= now ||
        envelope.value === undefined
      ) {
        return null;
      }
      return { value: envelope.value, kind: "cache" };
    } catch {
      // Unavailable storage, retired key or corrupt entry is never authority.
      return null;
    }
  }
  private async resolve<T>(
    key: string,
    deadline: number,
    produce: () => Promise<T>,
  ): Promise<Reused<T>> {
    this.deadline(deadline);
    const cached = await this.read<T>(key);
    this.deadline(deadline);
    if (cached) {
      return cached;
    }
    const owner = randomUUID();
    let claimed: boolean;
    try {
      claimed = await this.store.claim(key, owner);
    } catch {
      // Before dispatch only: disable the optimization, never replay a failed SQL call.
      this.deadline(deadline);
      return { value: await produce(), kind: "fresh" };
    }
    if (!claimed) {
      // No takeover/retry after lease expiry: a missing result is not proof of no dispatch.
      while (true) {
        this.deadline(deadline);
        const result = await this.read<T>(key);
        if (result) {
          return { ...result, kind: "singleflight" };
        }
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(50, Math.max(1, deadline - Date.now()))),
        );
      }
    }
    try {
      this.deadline(deadline);
      // The previous leader may have published between our initial miss and NX claim.
      const published = await this.read<T>(key);
      this.deadline(deadline);
      if (published) {
        return published;
      }
      const value = await produce();
      this.deadline(deadline);
      const createdAt = Date.now();
      const cipher = this.crypto.encrypt(
        JSON.stringify({ key, version: 2, createdAt, until: createdAt + this.ttlMs, value }),
      );
      if (Buffer.byteLength(cipher, "utf8") <= MAX_ENTRY_BYTES) {
        try {
          await this.store.publish(key, owner, cipher, this.ttlMs);
        } catch {
          /* A storage failure after SQL never dispatches it again. */
        }
      }
      return { value, kind: "fresh" };
    } finally {
      try {
        await this.store.release(key, owner);
      } catch {
        /* A remote lease expires; only its owner may release it. */
      }
    }
  }
  async run<T>(material: string, deadline: number, produce: () => Promise<T>): Promise<Reused<T>> {
    const key = this.key(material);
    let job = this.inflight.get(key) as Promise<Reused<T>> | undefined;
    const waiter = !!job;
    if (!job) {
      if (this.inflight.size >= MAX_INFLIGHT) {
        throw new PersonaV2Error("BUDGET_EXCEEDED", "Limite de consultas em andamento atingido.");
      }
      job = this.resolve(key, deadline, produce).finally(() => {
        this.inflight.delete(key);
      });
      this.inflight.set(key, job);
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      this.deadline(deadline);
      const result = await Promise.race([
        job,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new PersonaV2Error(
                  "BUDGET_EXCEEDED",
                  "Prazo de espera excedido; consulta em andamento não foi reenviada.",
                ),
              ),
            Math.max(0, deadline - Date.now()),
          );
        }),
      ]);
      this.deadline(deadline);
      return { value: structuredClone(result.value), kind: waiter ? "singleflight" : result.kind };
    } finally {
      clearTimeout(timer);
    }
  }
}
