import { randomUUID } from "node:crypto";
import type {
  QuerySingleflightOptions,
  QuerySingleflightPort,
} from "../../domain/ports/query-singleflight.port.js";

export class MemoryQuerySingleflight implements QuerySingleflightPort {
  private readonly inflight = new Map<string, Promise<unknown>>();
  async run<T>(
    key: string,
    operation: () => Promise<T>,
    options?: QuerySingleflightOptions<T>,
  ): Promise<{ value: T; role: "leader" | "waiter"; waitMs: number }> {
    const started = Date.now();
    const existing = this.inflight.get(key) as Promise<T> | undefined;
    if (existing)
      return { value: await existing, role: "waiter" as const, waitMs: Date.now() - started };
    const job = operation()
      .then(async (value) => {
        await options?.onLeaderResult?.(value);
        return value;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, job);
    return { value: await job, role: "leader" as const, waitMs: 0 };
  }
}

interface RedisLeaseKv {
  set(key: string, value: string, options: { PX: number; NX: true }): Promise<unknown>;
  get(key: string): Promise<string | null>;
  del?(key: string): Promise<unknown>;
}

/**
 * A lease Redis dura até o líder publicar o resultado no cache. Réplicas que
 * aguardam leem esse resultado antes de cogitar a própria execução. Uma falha
 * do Redis permanece fail-open e preserva a coalescência local.
 */
export class RedisQuerySingleflight extends MemoryQuerySingleflight {
  constructor(
    private readonly redis: RedisLeaseKv,
    private readonly leaseMs: number,
    private readonly waitMs: number,
  ) {
    super();
  }
  override async run<T>(
    key: string,
    operation: () => Promise<T>,
    options?: QuerySingleflightOptions<T>,
  ): Promise<{ value: T; role: "leader" | "waiter"; waitMs: number }> {
    const localKey = `mcp:query:flight:${key}`;
    const token = randomUUID();
    let remoteLeader = false;
    const started = Date.now();
    try {
      const acquired = await this.redis.set(localKey, token, { PX: this.leaseMs, NX: true });
      remoteLeader = acquired === "OK";
      if (!remoteLeader) {
        const deadline = Date.now() + Math.max(0, options?.waitMs ?? this.waitMs);
        while (Date.now() < deadline && (await this.redis.get(localKey)) !== null)
          await new Promise((resolve) => setTimeout(resolve, 100));
        const shared = await options?.readShared?.();
        if (shared !== undefined) {
          return { value: shared, role: "waiter", waitMs: Date.now() - started };
        }
      }
    } catch {
      // fail-open: o mapa local ainda evita rajadas na réplica atual.
    }
    try {
      return await super.run(key, operation, options);
    } finally {
      if (remoteLeader) {
        try {
          await this.redis.del?.(localKey);
        } catch {
          /* fail-open */
        }
      }
    }
  }
}
