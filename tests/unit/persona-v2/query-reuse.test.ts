import { expect, it, vi } from "vitest";
import {
  PersonaQueryReuse,
  PersonaMemoryQueryStore,
  PERSONA_QUERY_REUSE_PREFIX,
} from "../../../src/infrastructure/persona-v2/query-reuse.js";
import { NodeCryptoAdapter } from "../../../src/infrastructure/crypto/node-crypto.adapter.js";
import { DomainError } from "../../../src/domain/errors/domain-error.js";
import { SourceExecutionError } from "../../../src/domain/persona-v2/source-execution-error.js";
import { reportPersonaV2ToolError } from "../../../src/infrastructure/mcp/persona-v2-tool-error.js";
const crypto = new NodeCryptoAdapter("a".repeat(64));
const create = (store = new PersonaMemoryQueryStore(), ttl = 1000) =>
  new PersonaQueryReuse(store, crypto, "fixture-cache-key", "https://fixture.test", ttl);

it("singleflight preserva diagnóstico original e não cacheia falha nem repete o produtor", async () => {
  const store = new PersonaMemoryQueryStore(),
    reuse = create(store);
  const publish = vi.spyOn(store, "publish");
  vi.spyOn(store, "release").mockRejectedValue(new Error("private-cleanup"));
  let fail!: () => void;
  const gate = new Promise<void>((resolve) => {
    fail = resolve;
  });
  const error = new SourceExecutionError(
    new DomainError({
      code: "PLUG_SERVER_ERROR",
      message: "private-native",
      hint: "private-hint",
      source: "plug_server_http",
      stage: "sql.execute.response",
      details: { transportReason: "network", errno: "ECONNRESET" },
    }),
    "sql_fornecido",
    ["publication"],
  );
  const produce = vi.fn(async () => {
    await gate;
    throw error;
  });
  const leader = reuse.run("same", Date.now() + 1000, produce).catch((e: unknown) => e);
  const follower = reuse.run("same", Date.now() + 1000, produce).catch((e: unknown) => e);
  fail();
  const errors = await Promise.all([leader, follower]);
  for (const item of errors) {
    expect(item).toBe(error);
    const reply = reportPersonaV2ToolError(item);
    expect(reply).toMatchObject({
      source: "plug_server_http",
      stage: "sql.execute.response",
      retryable: false,
      details: { transportReason: "network", errno: "ECONNRESET" },
    });
    expect(JSON.stringify(reply)).not.toContain("private-");
  }
  expect(produce).toHaveBeenCalledTimes(1);
  expect(publish).not.toHaveBeenCalled();
});
it("usa chaves opacas e valores cifrados, sem alterar horário de leitura ou compartilhar referências", async () => {
  const store = new PersonaMemoryQueryStore(),
    publish = vi.spyOn(store, "publish"),
    reuse = create(store);
  const produce = vi.fn(async () => ({ rows: [{ amount: "10.25" }], readAt: "original" }));
  const first = await reuse.run("SELECT fixture with secret parameter", Date.now() + 1000, produce);
  first.value.rows[0]!.amount = "altered";
  const next = await reuse.run("SELECT fixture with secret parameter", Date.now() + 1000, produce);
  expect(next).toEqual({
    kind: "cache",
    value: { rows: [{ amount: "10.25" }], readAt: "original" },
  });
  expect(produce).toHaveBeenCalledTimes(1);
  expect(publish.mock.calls[0]![0]).toMatch(
    new RegExp(`^${PERSONA_QUERY_REUSE_PREFIX}[a-f0-9]{64}$`),
  );
  expect(JSON.stringify(publish.mock.calls)).not.toMatch(/SELECT|secret parameter|10\.25/);
});
it("coalesce concorrentes, libera erro sem armazená-lo e preserva limite de espera independente", async () => {
  const reuse = create(),
    produce = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 30));
      return { value: 1 };
    });
  const leader = reuse.run("same", Date.now() + 1000, produce);
  await expect(reuse.run("same", Date.now() + 5, produce)).rejects.toMatchObject({
    code: "BUDGET_EXCEEDED",
  });
  const waiter = reuse.run("same", Date.now() + 1000, produce);
  expect((await leader).kind).toBe("fresh");
  expect((await waiter).kind).toBe("singleflight");
  expect(produce).toHaveBeenCalledTimes(1);
  const failure = vi.fn(async () => {
    throw new Error("native failure");
  });
  await expect(reuse.run("failure", Date.now() + 1000, failure)).rejects.toThrow("native failure");
  await expect(reuse.run("failure", Date.now() + 1000, failure)).rejects.toThrow("native failure");
  expect(failure).toHaveBeenCalledTimes(2);
});
it("expira sem renovar TTL no hit e ignora cifra corrompida", async () => {
  const store = new PersonaMemoryQueryStore(),
    reuse = create(store, 15),
    produce = vi.fn(async () => "result");
  await reuse.run("same", Date.now() + 1000, produce);
  await new Promise((r) => setTimeout(r, 25));
  expect((await reuse.run("same", Date.now() + 1000, produce)).kind).toBe("fresh");
  expect(produce).toHaveBeenCalledTimes(2);
  vi.spyOn(store, "get").mockResolvedValue("not a cipher");
  expect((await reuse.run("same", Date.now() + 1000, produce)).kind).toBe("fresh");
});
it("não repete SQL se escrita do cache falha após resultado; falha antes do dispatch só desativa otimização", async () => {
  const store = new PersonaMemoryQueryStore(),
    reuse = create(store),
    produce = vi.fn(async () => "result");
  vi.spyOn(store, "publish").mockRejectedValue(new Error("redis offline"));
  expect((await reuse.run("after", Date.now() + 1000, produce)).value).toBe("result");
  expect(produce).toHaveBeenCalledTimes(1);
  vi.spyOn(store, "claim").mockRejectedValue(new Error("redis offline"));
  expect((await reuse.run("before", Date.now() + 1000, produce)).value).toBe("result");
  expect(produce).toHaveBeenCalledTimes(2);
});
it("seguidor sem resultado não assume lease expirado ou envia outra consulta", async () => {
  const store = new PersonaMemoryQueryStore(),
    reuse = create(store),
    produce = vi.fn(async () => "never");
  vi.spyOn(store, "claim").mockResolvedValue(false);
  await expect(reuse.run("pending", Date.now() + 25, produce)).rejects.toMatchObject({
    code: "BUDGET_EXCEEDED",
  });
  expect(produce).not.toHaveBeenCalled();
});
it("limita memória e cifra grande, mantendo resultado fresco sem cache", async () => {
  const reuse = create(),
    produce = vi.fn(async () => "x".repeat(2 * 1024 * 1024));
  await reuse.run("large", Date.now() + 2000, produce);
  await reuse.run("large", Date.now() + 2000, produce);
  expect(produce).toHaveBeenCalledTimes(2);
});

it("reconfere entrada após claim para não repetir SQL publicado entre miss e lock", async () => {
  const store = new PersonaMemoryQueryStore(),
    a = create(store),
    b = create(store);
  const first = vi.fn(async () => "already-read"),
    second = vi.fn(async () => "duplicate");
  const claim = store.claim.bind(store);
  vi.spyOn(store, "claim").mockImplementationOnce(async () => {
    await a.run("race", Date.now() + 1000, first);
    return claim();
  });
  expect(await b.run("race", Date.now() + 1000, second)).toEqual({
    kind: "cache",
    value: "already-read",
  });
  expect(first).toHaveBeenCalledTimes(1);
  expect(second).not.toHaveBeenCalled();
});

it("TTL menor confere idade desde a criação, sem aceitar entrada antiga no fim do TTL maior", async () => {
  const store = new PersonaMemoryQueryStore(),
    a = create(store, 1000),
    b = create(store, 100);
  let now = Date.now();
  const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
  const produce = vi.fn(async () => ({ readAt: now }));
  try {
    const first = await a.run("age", now + 1000, produce);
    now += 10;
    expect((await b.run("age", now + 1000, produce)).kind).toBe("cache");
    now += 940;
    const next = await b.run("age", now + 1000, produce);
    expect(next.kind).toBe("fresh");
    expect(next.value.readAt).not.toBe(first.value.readAt);
    expect(produce).toHaveBeenCalledTimes(2);
  } finally {
    clock.mockRestore();
  }
});
