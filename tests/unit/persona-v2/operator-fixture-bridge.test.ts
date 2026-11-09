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
    call: { op: "prepare", seeds: [{ table: "publication_orders", rows: [] }] },
  };
  await pace(prepare);
  expect(sleep).not.toHaveBeenCalled();
  clock = 2000;
  await pace({ ...prepare, id: 2 });
  expect(sleep).toHaveBeenCalledExactlyOnceWith(8000);
  await pace({ kind: "request", id: 3, call: { op: "clear" } });
  clock = 25000;
  await pace({ ...prepare, id: 4 });
  expect(sleep).toHaveBeenCalledTimes(1);
});
it("falha no espaçamento propaga sem retry", async () => {
  const sleep = vi.fn(async () => {
    throw Error("interrupted");
  });
  const pace = createOperatorCasePacer(() => 0, sleep);
  const request = {
    kind: "request",
    id: 1,
    call: { op: "prepare", seeds: [{ table: "publication_orders", rows: [] }] },
  };
  await pace(request);
  await expect(pace({ ...request, id: 2 })).rejects.toThrow("interrupted");
  expect(sleep).toHaveBeenCalledTimes(1);
});
