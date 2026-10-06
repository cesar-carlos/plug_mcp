import type { RateLimitHit, RateLimitStore } from "./rate-limit.js";

const HIT_SCRIPT = `
local n = redis.call('INCR', KEYS[1])
if n == 1 then
  redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[1]))
end
local ttl = redis.call('PTTL', KEYS[1])
return {n, ttl}
`;

export interface RedisEvalClient {
  eval(script: string, options: { keys: string[]; arguments: string[] }): Promise<unknown>;
}

export class RedisRateLimitStore implements RateLimitStore {
  constructor(
    private readonly redis: RedisEvalClient,
    private readonly localFallback?: RateLimitStore,
  ) {}

  async hit(key: string, windowMs: number, max: number): Promise<RateLimitHit> {
    const local = await this.localFallback?.hit(key, windowMs, max);
    if (local && !local.allowed) return local;
    try {
      const raw = await this.redis.eval(HIT_SCRIPT, {
        keys: [`mcp:rl:${key}`],
        arguments: [String(windowMs)],
      });
      const pair = Array.isArray(raw) ? raw : [raw, windowMs];
      const count = Number(pair[0]);
      const ttl = Number(pair[1]);
      if (!Number.isFinite(count) || !Number.isFinite(ttl))
        throw new Error("invalid rate limit response");
      const retryAfterMs = ttl > 0 ? ttl : windowMs;
      return { allowed: count <= max, retryAfterMs };
    } catch (error) {
      if (local) return local;
      throw error;
    }
  }
}
