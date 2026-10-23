import { randomUUID } from "node:crypto";
import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import request, { type Response } from "supertest";
import { expect } from "vitest";
import { createClient } from "redis";
import type { Source } from "../../src/domain/persona-v2/model.js";
import { PERSONA_QUERY_REUSE_PREFIX } from "../../src/infrastructure/persona-v2/query-reuse.js";
import { parseMcpPayload } from "./mcp-rpc.js";

interface Reply {
  denied: boolean;
  value: {
    rows?: unknown[];
    reuse?: { kind: string };
    provenance?: { readAt: string; sourceId: string };
  };
}
interface CacheSource {
  id: string;
  skillId: string;
  capabilities: readonly string[];
  source: Source;
}
interface Context {
  root: string;
  origin: string;
  urls: readonly [string, string];
  redisUrl: string;
  personaId: string;
  sources: readonly CacheSource[];
  post(path: string, body: unknown): PromiseLike<Response>;
  waitFile(path: string): Promise<unknown>;
  sqlCalls(dialect: string): number;
  authorityCalls(dialect: string): number;
  redisRunning(running: boolean): void;
}

/** Two independent real compositions, one canonical origin and private native Redis. */
export async function exerciseChainCache(c: Context): Promise<void> {
  const redis = createClient({
    url: c.redisUrl,
    socket: { reconnectStrategy: false },
    disableOfflineQueue: true,
  });
  redis.on("error", () => undefined);
  await redis.connect();
  const hold = join(c.root, "mcp-cache-a-hold"),
    held = join(c.root, "mcp-cache-a-held.json"),
    following = join(c.root, "mcp-cache-b-following.json");
  const clear = (path: string) => {
    if (existsSync(path)) unlinkSync(path);
  };
  const arm = () => {
    clear(held);
    clear(following);
    writeFileSync(hold, "hold");
  };
  const issue = async (source: CacheSource) => {
    const response = await c.post(`/api/admin/personas/${c.personaId}/tokens`, {
      name: "Redis multi-instance fixture",
      expiresAt: null,
      delegation: { sourceIds: [], skills: [], externalOperationIds: [], administrative: [] },
      permissions: {
        sourceIds: [source.id],
        skills: [
          {
            skillId: source.skillId,
            capabilities: source.capabilities,
            effects: ["select"],
            requireHumanApproval: false,
          },
        ],
        externalOperationIds: [],
        administrative: [],
      },
    });
    expect(response.status).toBe(201);
    return response.body as { bearer: string; tokenId: string };
  };
  const call = async (
    index: number,
    source: CacheSource,
    bearer: string,
    minimum: number,
  ): Promise<Reply> => {
    const response = await request(c.urls[index]!)
      .post("/mcp")
      .set("Host", new URL(c.origin).host)
      .set("Accept", "application/json, text/event-stream")
      .set("Authorization", `Bearer ${bearer}`)
      .send({
        jsonrpc: "2.0",
        id: randomUUID(),
        method: "tools/call",
        params: {
          name: "consultar_dados",
          arguments: {
            fonteId: source.id,
            skillIds: [source.skillId],
            params: { minimum },
            options: { timeoutMs: 10000 },
          },
        },
      });
    if (response.status === 401 || response.status === 403) return { denied: true, value: {} };
    expect(response.status).toBe(200);
    const result = parseMcpPayload(response).result as {
      isError?: boolean;
      content: { text: string }[];
    };
    return {
      denied: result.isError === true,
      value: JSON.parse(result.content[0]!.text) as Reply["value"],
    };
  };
  try {
    for (const source of c.sources) {
      const token = await issue(source),
        dialect = source.source.dialect;
      const before = c.sqlCalls(dialect),
        authorities = c.authorityCalls(dialect);
      arm();
      const leader = call(0, source, token.bearer, -901);
      await c.waitFile(held);
      const follower = call(1, source, token.bearer, -901);
      await c.waitFile(following);
      expect(c.sqlCalls(dialect)).toBe(before + 1);
      clear(hold);
      const [a, b] = await Promise.all([leader, follower]);
      expect(a.denied).toBe(false);
      expect(b.denied).toBe(false);
      expect(a.value.reuse?.kind).toBe("fresh");
      expect(b.value.reuse?.kind).toBe("singleflight");
      expect(b.value.rows).toEqual(a.value.rows);
      expect(b.value.provenance).toEqual(a.value.provenance);
      const hit = await call(1, source, token.bearer, -901);
      expect(hit.value.reuse?.kind).toBe("cache");
      expect(hit.value.provenance).toEqual(a.value.provenance);
      expect(c.sqlCalls(dialect)).toBe(before + 1);
      expect(c.authorityCalls(dialect)).toBeGreaterThan(authorities);

      const other = await issue(source);
      expect((await call(1, source, other.bearer, -901)).value.reuse?.kind).toBe("fresh");
      expect(c.sqlCalls(dialect)).toBe(before + 2);
      expect((await call(0, source, token.bearer, -901)).value.reuse?.kind).toBe("cache");
      // Revoke while one SQL result is held before Redis publication and another process waits.
      arm();
      const pendingA = call(0, source, token.bearer, -902);
      await c.waitFile(held);
      const pendingB = call(1, source, token.bearer, -902);
      await c.waitFile(following);
      const revoked = await c.post(
        `/api/admin/personas/${c.personaId}/tokens/${token.tokenId}/revogar`,
        {},
      );
      expect(revoked.status).toBe(204);
      clear(hold);
      for (const denied of await Promise.all([pendingA, pendingB])) {
        expect(denied.denied).toBe(true);
        expect(denied.value).not.toHaveProperty("rows");
      }
      expect((await call(1, source, token.bearer, -901)).denied).toBe(true);
      expect(c.sqlCalls(dialect)).toBe(before + 3);
    }
    const keys = await redis.keys(`${PERSONA_QUERY_REUSE_PREFIX}*`);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(key).toMatch(new RegExp(`^${PERSONA_QUERY_REUSE_PREFIX}[a-f0-9]{64}$`));
      expect(await redis.get(key)).toMatch(/^v2\.primary\./);
    }
    // Real outage after native SQL: the waiting process must expire, never become leader.
    const source = c.sources[0]!,
      token = await issue(source),
      before = c.sqlCalls(source.source.dialect);
    arm();
    const leader = call(0, source, token.bearer, -903);
    await c.waitFile(held);
    const follower = call(1, source, token.bearer, -903);
    await c.waitFile(following);
    c.redisRunning(false);
    clear(hold);
    expect((await leader).value.reuse?.kind).toBe("fresh");
    const refused = await follower;
    expect(refused.denied).toBe(true);
    expect(refused.value).not.toHaveProperty("rows");
    expect(c.sqlCalls(source.source.dialect)).toBe(before + 1);
    const offline = await call(1, source, token.bearer, -904);
    expect(offline.denied).toBe(false);
    expect(offline.value.reuse?.kind).toBe("fresh");
    expect(c.sqlCalls(source.source.dialect)).toBe(before + 2);
    c.redisRunning(true);
    const recovered = createClient({
      url: c.redisUrl,
      socket: { connectTimeout: 1000, reconnectStrategy: false },
      disableOfflineQueue: true,
    });
    recovered.on("error", () => undefined);
    try {
      await recovered.connect();
      expect(await recovered.ping()).toBe("PONG");
    } finally {
      if (recovered.isOpen) recovered.destroy();
    }
  } finally {
    clear(hold);
    clear(held);
    clear(following);
    if (redis.isOpen) redis.destroy();
    c.redisRunning(true);
  }
}
