import type { QueryResultCachePort } from "../../domain/ports/query-result-cache.port.js";
import type { PolicyCacheKv } from "../plug-server/policy-cache.js";

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
}

export class RedisQueryResultCache implements QueryResultCachePort {
  constructor(
    private readonly kv: PolicyCacheKv,
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
}
