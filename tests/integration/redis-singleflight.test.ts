import { randomUUID } from "node:crypto";
import { createClient } from "redis";
import { describe, expect, it } from "vitest";
import { RedisQuerySingleflight } from "../../src/infrastructure/cache/query-singleflight.js";

const url = process.env.REDIS_URL;
describe.skipIf(!url)("Redis real: lease por proprietário", () => {
  it("renova o líder e não inicia outra consulta após timeout do concorrente", async () => {
    const redis = createClient({ url });
    await redis.connect();
    const key = randomUUID();
    let executions = 0;
    const a = new RedisQuerySingleflight(redis, 300, 1000),
      b = new RedisQuerySingleflight(redis, 300, 1000);
    let release: () => void = () => undefined;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const leader = a.run(key, async () => {
      executions++;
      await barrier;
      return 42;
    });
    try {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await expect(
        b.run(
          key,
          () => {
            executions++;
            return Promise.resolve(99);
          },
          { waitMs: 50 },
        ),
      ).rejects.toMatchObject({ code: "QUERY_TIMEOUT" });
      expect(executions).toBe(1);
      expect(await redis.get(`mcp:query:flight:${key}`)).not.toBeNull();
      release();
      expect((await leader).value).toBe(42);
      expect(await redis.get(`mcp:query:flight:${key}`)).toBeNull();
    } finally {
      release();
      await leader;
      await redis.del(`mcp:query:flight:${key}`);
      await redis.quit();
    }
  });
  it("não renova nem remove lease que passou a outro proprietário", async () => {
    const redis = createClient({ url });
    await redis.connect();
    const key = randomUUID(),
      lease = `mcp:query:flight:${key}`;
    let release: () => void = () => undefined;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const leader = new RedisQuerySingleflight(redis, 300, 1000).run(key, async () => {
      await barrier;
      return 1;
    });
    try {
      await new Promise((resolve) => setTimeout(resolve, 80));
      await redis.set(lease, "another-owner", { PX: 2000 });
      await new Promise((resolve) => setTimeout(resolve, 240));
      expect(await redis.pTTL(lease)).toBeGreaterThan(1500);
      release();
      await leader;
      expect(await redis.get(lease)).toBe("another-owner");
    } finally {
      release();
      await leader;
      await redis.del(lease);
      await redis.quit();
    }
  });
  it("Redis indisponível preserva coalescência local sem retry da consulta", async () => {
    const unavailable = {
      set: () => Promise.reject(new Error("offline")),
      get: () => Promise.reject(new Error("offline")),
    };
    const flight = new RedisQuerySingleflight(unavailable, 300, 1000);
    let executions = 0;
    const op = async () => {
      executions++;
      await new Promise((resolve) => setTimeout(resolve, 30));
      return 9;
    };
    const results = await Promise.all([flight.run("offline", op), flight.run("offline", op)]);
    expect(results.map((r) => r.value)).toEqual([9, 9]);
    expect(executions).toBe(1);
  });
});
