import type { QueryResultCachePort } from "../../domain/ports/query-result-cache.port.js";
import type { PolicyCacheKv } from "../plug-server/policy-cache.js";

interface RedisKv extends PolicyCacheKv {
  scanIterator?(options: { MATCH: string }): AsyncIterable<string | readonly string[]>;
  del?(key: string): Promise<unknown>;
}

export class MemoryQueryResultCache implements QueryResultCachePort {
  private readonly store = new Map<string, { value: string; expiresAt: number }>();

  get(key: string): Promise<string | null> {
    const hit = this.store.get(key);
    if (!hit) {
      return Promise.resolve(null);
    }
    if (hit.expiresAt <= Date.now()) {
      this.store.delete(key);
      return Promise.resolve(null);
    }
    return Promise.resolve(hit.value);
  }

  set(key: string, value: string, ttlMs: number): Promise<void> {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
    return Promise.resolve();
  }

  deleteByPrefix(prefix: string): Promise<number> {
    let removed = 0;
    for (const key of [...this.store.keys()]) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
        removed += 1;
      }
    }
    return Promise.resolve(removed);
  }
}

export class RedisQueryResultCache implements QueryResultCachePort {
  constructor(
    private readonly kv: RedisKv,
    private readonly memory = new MemoryQueryResultCache(),
  ) {}

  async get(key: string): Promise<string | null> {
    const local = await this.memory.get(key);
    if (local) {
      return local;
    }
    return this.kv.get(key);
  }

  async set(key: string, value: string, ttlMs: number): Promise<void> {
    await this.memory.set(key, value, ttlMs);
    await this.kv.set(key, value, { PX: ttlMs });
  }

  async deleteByPrefix(prefix: string): Promise<number> {
    const local = await this.memory.deleteByPrefix(prefix);
    if (!this.kv.scanIterator || !this.kv.del) {
      return local;
    }
    const keys: string[] = [];
    for await (const item of this.kv.scanIterator({ MATCH: `${prefix}*` })) {
      if (typeof item === "string") {
        keys.push(item);
      } else {
        keys.push(...item);
      }
    }
    if (keys.length === 0) {
      return local;
    }
    for (const key of keys) {
      await this.kv.del(key);
    }
    return local + keys.length;
  }
}
