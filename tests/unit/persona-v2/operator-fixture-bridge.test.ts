import { DomainError } from "../../../src/domain/errors/domain-error.js";
import { PassThrough } from "node:stream";
import { afterEach, expect, it, vi } from "vitest";
import { OperatorChannel } from "../../../src/infrastructure/persistence/persona-v2/operator-channel.js";
import {
  createOperatorCasePacer,
  LocalOperatorFixture,
  RemoteOperatorFixture,
} from "../../../src/infrastructure/persistence/persona-v2/operator-fixture-bridge.js";
import {
  operatorFixtureSchema,
  operatorStartSchema,
} from "../../../src/infrastructure/persistence/persona-v2/operator-contract.js";
import { trainingSource } from "../../helpers/persona-v2-training.js";
import { manualPublicationTables } from "../../../scripts/homologation/manual-publication-tables.js";

const channels: OperatorChannel[] = [];
afterEach(() => {
  for (const channel of channels.splice(0)) channel.close();
});
function fixture() {
  const runId = "se7e_persona_abcdef123456_test";
  const descriptor = operatorFixtureSchema.parse({
    runId,
    expiresAt: new Date(Date.now() + 600000).toISOString(),
    tables: manualPublicationTables("mssql"),
    source: {
      ...trainingSource,
      database: runId,
      dialect: "mssql",
      name: "Operator fixture",
      purpose: "Synthetic publication cases",
      rowRestrictions: [],
    },
  });
  const up = new PassThrough(),
    down = new PassThrough();
  const client = new OperatorChannel(down, up),
    server = new OperatorChannel(up, down);
  channels.push(client, server);
  const lease = {
    policyFingerprint: "a".repeat(64),
    execute: vi.fn(async () => ({ columns: ["id"], rows: [{ id: 1 }], truncated: false })),
    revalidate: vi.fn(async () => undefined),
  };
  const reads = { authorize: vi.fn(async () => lease) };
  const control = { prepare: vi.fn(async () => undefined), clear: vi.fn(async () => undefined) };
  const handler = new LocalOperatorFixture(descriptor, reads, control);
  const remote = new RemoteOperatorFixture(client, descriptor);
  return {
    descriptor,
    up,
    down,
    client,
    server,
    lease,
    reads,
    control,
    handler,
    remote,
    serve: async () => server.send(await handler.handle(await server.read())),
  };
}
it("canal privado mantém fonte fixa, guardas, parâmetros e revalidação", async () => {
  const f = fixture();
  const serving = f.serve();
  const lease = await f.remote.authorize(f.descriptor.source, [
    { name: "publication_orders", type: "table" },
  ]);
  await serving;
  expect(f.reads.authorize).toHaveBeenCalledWith(
    f.descriptor.source,
    [{ name: "publication_orders", type: "table" }],
    { exactResources: true, requireDatabase: true },
  );
  const executing = f.serve();
  expect(
    await lease.execute(
      "SELECT id FROM publication_orders WHERE id=:id",
      { id: 1 },
      { maxRows: 2, timeoutMs: 15000 },
    ),
  ).toMatchObject({ rows: [{ id: 1 }], truncated: false });
  await executing;
  expect(f.lease.execute).toHaveBeenCalledWith(
    "SELECT id FROM publication_orders WHERE id=:id",
    { id: 1 },
    { maxRows: 2, timeoutMs: 15000 },
    undefined,
  );
  const validating = f.serve();
  await lease.revalidate();
  await validating;
  expect(f.lease.revalidate).toHaveBeenCalledOnce();
});
it("fonte divergente não envia requisição", async () => {
  const f = fixture();
  await expect(
    f.remote.authorize({ ...f.descriptor.source, database: "operational" }, [
      { name: "publication_orders", type: "table" },
    ]),
  ).rejects.toThrow("mismatch");
  expect(f.reads.authorize).not.toHaveBeenCalled();
});
it("perda da confirmação inutiliza transporte sem reenviar ou limpar", async () => {
  const f = fixture();
  const pending = f.remote.clear(f.descriptor.source);
  await f.handler.handle(await f.server.read());
  f.down.end();
  await expect(pending).rejects.toThrow("do not retry");
  await expect(f.remote.clear(f.descriptor.source)).rejects.toThrow("unavailable");
  expect(f.control.clear).toHaveBeenCalledOnce();
});
it("replay e recurso fora da fixture não executam", async () => {
  const f = fixture();
  const request = {
    kind: "request",
    id: 1,
    call: { op: "authorize", resources: [{ name: "erp", type: "table" }] },
  };
  expect(await f.handler.handle(request)).toEqual({ kind: "response", id: 1, ok: false });
  await expect(f.handler.handle(request)).rejects.toThrow();
  expect(f.reads.authorize).not.toHaveBeenCalled();
});
it("mensagem de aprovação, segredo ou banco operacional é recusada pelo contrato", () => {
  const f = fixture();
  expect(() =>
    operatorStartSchema.parse({ mode: "run", approved: true, credentials: "private" }),
  ).toThrow();
  expect(() =>
    operatorFixtureSchema.parse({
      ...f.descriptor,
      source: { ...f.descriptor.source, database: "erp" },
    }),
  ).toThrow();
});
it("frame excedido é recusado sem ecoar conteúdo", async () => {
  const f = fixture();
  const pending = f.server.read();
  f.up.write(Buffer.alloc(4 * 1024 * 1024 + 1, 65));
  await expect(pending).rejects.toThrow("channel unavailable");
});
it.each([
  "DELETE FROM publication_orders",
  "SELECT id FROM another_table",
  "SELECT id FROM publication_orders; DELETE FROM publication_orders",
])("ponte recusa escrita ou SQL fora da fixture: %s", async (sql) => {
  const f = fixture();
  const serving = f.serve();
  const lease = await f.remote.authorize(f.descriptor.source, [
    { name: "publication_orders", type: "table" },
  ]);
  await serving;
  const executing = f.serve();
  await expect(lease.execute(sql, {}, { maxRows: 10 })).rejects.toThrow("do not retry");
  await executing;
  expect(f.lease.execute).not.toHaveBeenCalled();
});
it("replay após sucesso inutiliza a sessão inteira", async () => {
  const f = fixture();
  const call = { kind: "request", id: 1, call: { op: "clear" } };
  expect(await f.handler.handle(call)).toMatchObject({ ok: true });
  await expect(f.handler.handle(call)).rejects.toThrow();
  await expect(f.handler.handle({ ...call, id: 2 })).rejects.toThrow();
  expect(f.control.clear).toHaveBeenCalledOnce();
});

it("diagnóstico local conserva cota enumerada sem dados privados nem replay", async () => {
  const f = fixture();
  f.reads.authorize.mockRejectedValueOnce(
    new DomainError({
      code: "RATE_LIMITED",
      source: "plug_server_http",
      retryAfterMs: 45000,
      message: "private SQL token",
      hint: "private",
      details: { password: "private" },
    }),
  );
  const request = {
    kind: "request",
    id: 1,
    call: { op: "authorize", resources: [{ name: "publication_orders", type: "table" }] },
  };
  expect(await f.handler.handle(request)).toEqual({ kind: "response", id: 1, ok: false });
  expect(f.handler.failure).toEqual({
    operation: "authorize",
    code: "RATE_LIMITED",
    source: "plug_server_http",
    retryAfterMs: 45000,
  });
  expect(JSON.stringify(f.handler.failure)).not.toContain("private");
  const copy = f.handler.failure!;
  copy.code = "changed";
  expect(f.handler.failure?.code).toBe("RATE_LIMITED");
  await expect(f.handler.handle({ ...request, id: 2 })).rejects.toThrow();
  expect(f.reads.authorize).toHaveBeenCalledOnce();
});
it("diagnóstico local não publica erro livre ou origem desconhecida", async () => {
  const f = fixture();
  f.control.clear.mockRejectedValueOnce(new Error("private secret"));
  expect(await f.handler.handle({ kind: "request", id: 1, call: { op: "clear" } })).toMatchObject({
    ok: false,
  });
  expect(f.handler.failure).toEqual({ operation: "clear", code: "RUNNER_FAILED" });
});
it("diagnóstico local omite prazo inválido e origem não enumerada", async () => {
  const f = fixture();
  f.control.clear.mockRejectedValueOnce(
    new DomainError({
      code: "RATE_LIMITED",
      source: "private secret",
      retryAfterMs: Infinity,
      message: "private",
      hint: "private",
    }),
  );
  await f.handler.handle({ kind: "request", id: 1, call: { op: "clear" } });
  expect(f.handler.failure).toEqual({ operation: "clear", code: "RATE_LIMITED" });
});

it("espaça preparações sem atrasar limpeza nem repetir chamadas", async () => {
  let clock = 0;
  const sleep = vi.fn(async (ms: number) => {
    clock += ms;
  });
  const pace = createOperatorCasePacer(() => clock, sleep);
  const prepare = {
    kind: "request",
    id: 1,
    call: { op: "prepare", seeds: [{ table: "publication_orders", generated: [], rows: [] }] },
  };
  await pace(prepare);
  expect(sleep).not.toHaveBeenCalled();
  clock = 2000;
  await pace({ ...prepare, id: 2 });
  expect(sleep).toHaveBeenCalledTimes(9);
  expect(sleep.mock.calls.reduce((n, [ms]) => n + ms, 0)).toBe(88000);
  await pace({ kind: "request", id: 3, call: { op: "clear" } });
  clock = 190000;
  await pace({ ...prepare, id: 4 });
  expect(sleep).toHaveBeenCalledTimes(9);
});
it("falha no espaçamento propaga sem retry", async () => {
  const sleep = vi.fn(async () => {
    throw Error("interrupted");
  });
  const pace = createOperatorCasePacer(() => 0, sleep);
  const request = {
    kind: "request",
    id: 1,
    call: { op: "prepare", seeds: [{ table: "publication_orders", generated: [], rows: [] }] },
  };
  await pace(request);
  await expect(pace({ ...request, id: 2 })).rejects.toThrow("interrupted");
  expect(sleep).toHaveBeenCalledTimes(1);
});

it("não consome o orçamento SQL com pausas em autorização, execução ou revalidação", async () => {
  let clock = 0;
  const sleep = vi.fn(async (ms: number) => {
    clock += ms;
  });
  const pace = createOperatorCasePacer(() => clock, sleep);
  await pace({
    kind: "request",
    id: 1,
    call: { op: "authorize", resources: [{ name: "publication_orders", type: "table" }] },
  });
  await pace({
    kind: "request",
    id: 2,
    call: { op: "revalidate", lease: "7b71c68d-c3a7-41b2-aab4-3f0162151803" },
  });
  expect(sleep).not.toHaveBeenCalled();
  await pace({
    kind: "request",
    id: 3,
    call: {
      op: "execute",
      lease: "7b71c68d-c3a7-41b2-aab4-3f0162151803",
      sql: "SELECT 1",
      params: {},
      options: { timeoutMs: 15000 },
    },
  });
  await pace({ kind: "request", id: 3, call: { op: "clear" } });
  expect(sleep).not.toHaveBeenCalled();
  expect(clock).toBeLessThan(45000);
});

it("espera de preparo mantém o canal vivo além de45s sem executar ou aprovar", async () => {
  vi.useFakeTimers();
  try {
    const f = fixture();
    const pending = f.remote.prepare(f.descriptor.source, [
      { table: "publication_orders", generated: [], rows: [] },
    ]);
    const request = (await f.server.read()) as { id: number };
    for (let remainingMs = 90000; remainingMs > 0; remainingMs -= 10000) {
      await f.server.send({ kind: "prepare-wait", id: request.id, remainingMs });
      await vi.advanceTimersByTimeAsync(10000);
    }
    expect(f.control.prepare).not.toHaveBeenCalled();
    await f.server.send(await f.handler.handle(request));
    await pending;
    expect(f.control.prepare).toHaveBeenCalledOnce();
    expect(f.reads.authorize).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});

it.each(["wrong-id", "non-decreasing", "authorize"])(
  "recusa progresso inválido: %s",
  async (variant) => {
    const f = fixture();
    const pending =
      variant === "authorize"
        ? f.remote.authorize(f.descriptor.source, [{ name: "publication_orders", type: "table" }])
        : f.remote.prepare(f.descriptor.source, [
            { table: "publication_orders", generated: [], rows: [] },
          ]);
    const rejected = expect(pending).rejects.toThrow("do not retry");
    const request = (await f.server.read()) as { id: number };
    await f.server.send({
      kind: "prepare-wait",
      id: request.id + (variant === "wrong-id" ? 1 : 0),
      remainingMs: 90000,
    });
    if (variant === "non-decreasing") {
      await f.server.send({ kind: "prepare-wait", id: request.id, remainingMs: 90000 });
    }
    await rejected;
    expect(f.control.prepare).not.toHaveBeenCalled();
    expect(f.reads.authorize).not.toHaveBeenCalled();
  },
);

it("pacing anuncia espera decrescente apenas antes de preparar", async () => {
  let clock = 0;
  const sleep = vi.fn(async (ms: number) => {
    clock += ms;
  });
  const progress = vi.fn(async () => undefined);
  const pace = createOperatorCasePacer(() => clock, sleep);
  const request = {
    kind: "request",
    id: 1,
    call: { op: "prepare", seeds: [{ table: "publication_orders", generated: [], rows: [] }] },
  };
  await pace(request, progress);
  await pace({ ...request, id: 2 }, progress);
  expect(progress).toHaveBeenCalledTimes(9);
  expect(progress.mock.calls).toEqual(
    Array.from({ length: 9 }, (_, n) => [
      { kind: "prepare-wait", id: 2, remainingMs: 90000 - n * 10000 },
    ]),
  );
  expect(clock).toBe(90000);
});

it.each(["count", "deadline", "expiry", "silent"])(
  "encerra preparo sem replay ao ultrapassar limite: %s",
  async (variant) => {
    vi.useFakeTimers();
    try {
      const f = fixture();
      if (variant === "expiry") f.descriptor.expiresAt = new Date(Date.now() + 25000).toISOString();
      const pending = f.remote.prepare(f.descriptor.source, [
        { table: "publication_orders", generated: [], rows: [] },
      ]);
      const rejected = expect(pending).rejects.toThrow("do not retry");
      const request = (await f.server.read()) as { id: number };
      if (variant === "count") {
        for (let i = 0; i < 10; i++) {
          await f.server.send({ kind: "prepare-wait", id: request.id, remainingMs: 90000 - i });
          await vi.advanceTimersByTimeAsync(1);
        }
      } else if (variant === "deadline") {
        for (let i = 0; i < 6; i++) {
          await f.server.send({ kind: "prepare-wait", id: request.id, remainingMs: 90000 - i });
          await vi.advanceTimersByTimeAsync(20000);
        }
        await f.server.send({ kind: "prepare-wait", id: request.id, remainingMs: 80000 });
        await vi.advanceTimersByTimeAsync(15000);
      } else {
        await f.server.send({ kind: "prepare-wait", id: request.id, remainingMs: 90000 });
        await vi.advanceTimersByTimeAsync(variant === "expiry" ? 25000 : 45000);
      }
      await rejected;
      expect(f.control.prepare).not.toHaveBeenCalled();
      await expect(f.remote.prepare(f.descriptor.source, [])).rejects.toThrow("unavailable");
      expect(f.reads.authorize).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  },
);

it("integra pacer e canal reais entre dois casos sem atrasar a consulta", async () => {
  vi.useFakeTimers();
  try {
    const f = fixture();
    const pace = createOperatorCasePacer(() => Date.now());
    const seeds = [{ table: "publication_orders", generated: [], rows: [] }];
    const serve = async () => {
      const frame = await f.server.read();
      await pace(frame, (progress) => f.server.send(progress));
      await f.server.send(await f.handler.handle(frame));
    };
    const first = f.remote.prepare(f.descriptor.source, seeds);
    await serve();
    await first;
    const second = f.remote.prepare(f.descriptor.source, seeds);
    const serving = serve();
    await vi.advanceTimersByTimeAsync(90000);
    await Promise.all([second, serving]);
    const started = Date.now();
    const authorization = f.remote.authorize(f.descriptor.source, [
      { name: "publication_orders", type: "table" },
    ]);
    await serve();
    const lease = await authorization;
    const execution = lease.execute("SELECT id FROM publication_orders", {}, { timeoutMs: 15000 });
    await serve();
    await expect(execution).resolves.toMatchObject({ rows: [{ id: 1 }] });
    expect(Date.now()).toBe(started);
    expect(f.control.prepare).toHaveBeenCalledTimes(2);
    expect(f.lease.execute).toHaveBeenCalledOnce();
  } finally {
    vi.useRealTimers();
  }
});
