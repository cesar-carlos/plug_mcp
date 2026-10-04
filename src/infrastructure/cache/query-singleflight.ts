import { randomUUID } from "node:crypto";
import { DomainError } from "../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../domain/errors/error-codes.js";
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
    if (existing) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const timeout =
          options?.waitMs === undefined
            ? undefined
            : new Promise<never>((_resolve, reject) => {
                timer = setTimeout(
                  () =>
                    reject(
                      new DomainError({
                        code: ERROR_CODES.QUERY_TIMEOUT,
                        message: "Prazo de espera da consulta compartilhada esgotado.",
                        hint: "A execução em andamento continuará; não repita automaticamente.",
                      }),
                    ),
                  Math.max(0, options.waitMs!),
                );
              });
        return {
          value: await (timeout ? Promise.race([existing, timeout]) : existing),
          role: "waiter",
          waitMs: Date.now() - started,
        };
      } finally {
        if (timer) {
          clearTimeout(timer);
        }
      }
    }
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
  eval?(script: string, options: { keys: string[]; arguments: string[] }): Promise<unknown>;
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
    let renewal: ReturnType<typeof setInterval> | undefined;
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
        if (await this.redis.get(localKey)) {
          throw new DomainError({
            code: ERROR_CODES.QUERY_TIMEOUT,
            message: "Prazo de espera da consulta compartilhada esgotado.",
            hint: "Uma execução já está em andamento. Aguarde sua conclusão; não repita a consulta automaticamente.",
          });
        }
        remoteLeader =
          (await this.redis.set(localKey, token, { PX: this.leaseMs, NX: true })) === "OK";
        if (!remoteLeader) {
          throw new DomainError({
            code: ERROR_CODES.QUERY_TIMEOUT,
            message: "Outra execução assumiu esta consulta.",
            hint: "Aguarde a consulta em andamento.",
          });
        }
      }
      if (remoteLeader && this.redis.eval) {
        renewal = setInterval(
          () => {
            void this.redis
              .eval?.(
                "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) else return 0 end",
                { keys: [localKey], arguments: [token, String(this.leaseMs)] },
              )
              .catch(() => undefined);
          },
          Math.max(100, Math.floor(this.leaseMs / 3)),
        );
        renewal.unref();
      }
    } catch (error) {
      if (error instanceof DomainError) {
        throw error;
      }
      // fail-open: o mapa local ainda evita rajadas na réplica atual.
    }
    try {
      return await super.run(key, operation, options);
    } finally {
      if (renewal) {
        clearInterval(renewal);
      }
      if (remoteLeader) {
        try {
          await this.redis.eval?.(
            "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
            { keys: [localKey], arguments: [token] },
          );
        } catch {
          /* fail-open */
        }
      }
    }
  }
}
