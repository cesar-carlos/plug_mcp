import { createHash } from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";

export interface RateLimitHit {
  readonly allowed: boolean;
  readonly retryAfterMs: number;
}

/** Store local ao adapter HTTP — não é port de domínio. */
export interface RateLimitStore {
  hit(key: string, windowMs: number, max: number): Promise<RateLimitHit>;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export class MemoryRateLimitStore implements RateLimitStore {
  private readonly hits = new Map<string, RateLimitEntry>();
  private lastSweep = Date.now();

  hit(key: string, windowMs: number, max: number): Promise<RateLimitHit> {
    const now = Date.now();
    this.sweepExpired(now, windowMs);
    const entry = this.hits.get(key);

    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + windowMs });
      return Promise.resolve({ allowed: true, retryAfterMs: windowMs });
    }

    if (entry.count >= max) {
      return Promise.resolve({
        allowed: false,
        retryAfterMs: Math.max(0, entry.resetAt - now),
      });
    }

    entry.count += 1;
    return Promise.resolve({ allowed: true, retryAfterMs: Math.max(0, entry.resetAt - now) });
  }

  private sweepExpired(now: number, windowMs: number): void {
    if (now - this.lastSweep < windowMs) {
      return;
    }
    this.lastSweep = now;
    for (const [key, entry] of this.hits) {
      if (entry.resetAt <= now) {
        this.hits.delete(key);
      }
    }
  }
}

export interface RateLimitOptions {
  readonly windowMs: number;
  readonly max: number;
  readonly keyGenerator?: (req: Request) => string;
  readonly store?: RateLimitStore;
}

/**
 * Fixed-window limiter per key (IP by default). Memory store is single-process;
 * pass a Redis store for `/mcp` when REDIS_URL is set.
 */
export const createRateLimiter = (options: RateLimitOptions): RequestHandler => {
  const store = options.store ?? new MemoryRateLimitStore();

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = options.keyGenerator?.(req) ?? req.ip ?? "unknown";
    void store
      .hit(key, options.windowMs, options.max)
      .then((result) => {
        if (!result.allowed) {
          res.setHeader("Retry-After", Math.ceil(result.retryAfterMs / 1000).toString());
          res.status(429).json({ error: "rate_limited", retryAfterMs: result.retryAfterMs });
          return;
        }
        next();
      })
      .catch(next);
  };
};

/** Hash the Authorization header so a leaked token is capped across IPs; never log this key. */
export const mcpRateLimitKey = (req: Request): string => {
  const auth = req.headers.authorization;
  if (typeof auth === "string" && auth.length > 0) {
    const digest = createHash("sha256").update(auth).digest("hex").slice(0, 16);
    return `mcp:auth:${digest}`;
  }
  return `mcp:ip:${req.ip ?? "unknown"}`;
};
