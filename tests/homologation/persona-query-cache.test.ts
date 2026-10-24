import { randomUUID } from "node:crypto";
import { createClient } from "redis";
import { beforeAll, afterAll, expect, it, vi } from "vitest";
import {
  PersonaQueryReuse,
  PERSONA_QUERY_REUSE_PREFIX,
} from "../../src/infrastructure/persona-v2/query-reuse.js";
import {
  PersonaRedisQueryStore,
  type PersonaQueryRedis,
} from "../../src/infrastructure/persona-v2/query-reuse-redis.js";
import { NodeCryptoAdapter } from "../../src/infrastructure/crypto/node-crypto.adapter.js";

const url = process.env.PERSONA_V2_TEST_REDIS_URL;
if (
  !url ||
  new URL(url).protocol !== "redis:" ||
  !["127.0.0.1", "localhost"].includes(new URL(url).hostname)
) {
  throw new Error(
    "PERSONA_V2_TEST_REDIS_URL deve indicar Redis local dedicado à fixture, sem fallback.",
  );
}
const first = createClient({
  url,
  socket: { reconnectStrategy: false },
  disableOfflineQueue: true,
});
const second = first.duplicate();
const keys = new Set<string>();
const wrap = (client: typeof first): PersonaQueryRedis => ({
  get: async (key) => {
    keys.add(key);
    return client.get(key);
  },
  set: async (key, value, options) => {
    keys.add(key);
    return client.set(key, value, options);
  },
  eval: async (script, options) => {
    options.keys.forEach((key) => keys.add(key));
    return client.eval(script, options);
  },
});
const crypto = new NodeCryptoAdapter("b".repeat(64));
const namespace = `https://cache-${randomUUID()}.fixture.test`;
const storeA = new PersonaRedisQueryStore(wrap(first)),
  storeB = new PersonaRedisQueryStore(wrap(second));
const reuseA = new PersonaQueryReuse(storeA, crypto, "synthetic-key", namespace, 1000);
const reuseB = new PersonaQueryReuse(storeB, crypto, "synthetic-key", namespace, 1000);
beforeAll(async () => {
  await first.connect();
  await second.connect();
});
afterAll(async () => {
  // Only opaque keys recorded by these random-namespace fixtures, never FLUSHDB.
  if (first.isReady && keys.size) {
    await first.del([...keys]);
  }
  if (first.isOpen) {
    first.destroy();
  }
  if (second.isOpen) {
    second.destroy();
  }
});
it("duas instâncias reutilizam resultado cifrado sem duplicar a leitura", async () => {
  const produce = vi.fn(async () => ({
    rows: [{ value: "native-fixture-value" }],
    readAt: "original",
  }));
  expect((await reuseA.run("cross-instance", Date.now() + 1000, produce)).kind).toBe("fresh");
  expect((await reuseB.run("cross-instance", Date.now() + 1000, produce)).kind).toBe("cache");
  expect(produce).toHaveBeenCalledTimes(1);
  for (const key of keys) {
    expect(key).toMatch(new RegExp(`^${PERSONA_QUERY_REUSE_PREFIX}[a-f0-9]{64}(:flight)?$`));
    const value = await first.get(key);
    if (!key.endsWith(":flight")) {
      expect(value).not.toBeNull();
    }
    expect(value ?? "").not.toContain("native-fixture-value");
  }
});
it("lease Redis real coordena líderes separados e seguidores sem takeover", async () => {
  const produce = vi.fn(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
    return { value: 1 };
  });
  const [a, b] = await Promise.all([
    reuseA.run("concurrent", Date.now() + 2000, produce),
    reuseB.run("concurrent", Date.now() + 2000, produce),
  ]);
  expect(produce).toHaveBeenCalledTimes(1);
  expect([a.kind, b.kind].sort()).toEqual(["fresh", "singleflight"]);
});
it("proprietário antigo não publica ou libera lease de outro processo", async () => {
  const key = PERSONA_QUERY_REUSE_PREFIX + crypto.sha256Hex(randomUUID());
  expect(await storeA.claim(key, "old-owner")).toBe(true);
  await first.set(`${key}:flight`, "new-owner", { PX: 120000 });
  expect(await storeA.publish(key, "old-owner", "synthetic-cipher", 1000)).toBe(false);
  await storeA.release(key, "old-owner");
  expect(await first.get(`${key}:flight`)).toBe("new-owner");
  expect(await first.get(key)).toBeNull();
});
it("lease desaparecido não é prova de ausência de SQL e não autoriza nova leitura", async () => {
  const store = new PersonaRedisQueryStore(wrap(second));
  vi.spyOn(store, "claim").mockImplementation(async (key) => {
    keys.add(`${key}:flight`);
    await second.set(`${key}:flight`, "abandoned", { PX: 1 });
    return false;
  });
  const reuse = new PersonaQueryReuse(store, crypto, "synthetic-key", namespace, 1000);
  const produce = vi.fn(async () => "must-not-run");
  await expect(reuse.run("abandoned", Date.now() + 75, produce)).rejects.toMatchObject({
    code: "BUDGET_EXCEEDED",
  });
  expect(produce).not.toHaveBeenCalled();
});
it("cliente Redis indisponível desativa otimização antes do envio e não repete após efeito", async () => {
  const closed = first.duplicate();
  await closed.connect();
  closed.destroy();
  const reuse = new PersonaQueryReuse(
    new PersonaRedisQueryStore(wrap(closed)),
    crypto,
    "synthetic-key",
    namespace,
    1000,
  );
  const produce = vi.fn(async () => "fresh-only");
  expect((await reuse.run("offline", Date.now() + 1000, produce)).value).toBe("fresh-only");
  expect(produce).toHaveBeenCalledTimes(1);
});

it("publicação entre miss e claim não duplica produção em duas conexões Redis", async () => {
  const a = vi.fn(async () => "already-read"),
    b = vi.fn(async () => "must-not-run");
  const original = storeB.claim.bind(storeB);
  const claim = vi.spyOn(storeB, "claim").mockImplementationOnce(async (key, owner) => {
    await reuseA.run("publish-race", Date.now() + 2000, a);
    return original(key, owner);
  });
  try {
    expect(await reuseB.run("publish-race", Date.now() + 2000, b)).toEqual({
      value: "already-read",
      kind: "cache",
    });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
  } finally {
    claim.mockRestore();
  }
});

it("perda de publicação depois da produção não repete; seguidor expira sem takeover", async () => {
  const client = first.duplicate();
  await client.connect();
  const store = new PersonaRedisQueryStore(wrap(client));
  const reuse = new PersonaQueryReuse(store, crypto, "synthetic-key", namespace, 1000);
  let finish!: () => void;
  const barrier = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const a = vi.fn(async () => {
    await barrier;
    client.destroy();
    return "produced-once";
  });
  const b = vi.fn(async () => "must-not-run");
  const followerClaim = vi.spyOn(storeB, "claim");
  const leader = reuse.run("publication-loss", Date.now() + 2000, a);
  await vi.waitFor(() => expect(a).toHaveBeenCalledTimes(1));
  const follower = expect(
    reuseB.run("publication-loss", Date.now() + 300, b),
  ).rejects.toMatchObject({ code: "BUDGET_EXCEEDED" });
  try {
    await vi.waitFor(() => expect(followerClaim).toHaveBeenCalledTimes(1));
    finish();
    expect((await leader).value).toBe("produced-once");
    await follower;
    expect(b).not.toHaveBeenCalled();
    expect(a).toHaveBeenCalledTimes(1);
  } finally {
    finish();
    followerClaim.mockRestore();
    if (client.isOpen) client.destroy();
  }
});

it("TTL curto não aceita entrada antiga de instância com TTL longo", async () => {
  let now = Date.now();
  const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
  const long = new PersonaQueryReuse(storeA, crypto, "synthetic-key", namespace, 1000);
  const short = new PersonaQueryReuse(storeB, crypto, "synthetic-key", namespace, 100);
  const produce = vi.fn(async () => ({ readAt: now }));
  try {
    const original = await long.run("different-ttl", now + 2000, produce);
    now += 10;
    expect((await short.run("different-ttl", now + 2000, produce)).kind).toBe("cache");
    now += 940;
    const fresh = await short.run("different-ttl", now + 2000, produce);
    expect(fresh.kind).toBe("fresh");
    expect(fresh.value.readAt).not.toBe(original.value.readAt);
    expect(produce).toHaveBeenCalledTimes(2);
  } finally {
    clock.mockRestore();
  }
});
