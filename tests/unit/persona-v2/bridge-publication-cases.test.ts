import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { BridgePublicationCaseExecutor } from "../../../src/infrastructure/plug-server/bridge-publication-cases.js";
import {
  compileOperationTraining,
  compileOperationCommand,
} from "../../../src/application/persona-v2/operation-training.js";
import { operationCaseSchema } from "../../../src/application/persona-v2/operation-cases.js";
import { trainingSource } from "../../helpers/persona-v2-training.js";
import { operationTraining, operationInput } from "../../helpers/persona-v2-operation.js";
import { NodeCryptoAdapter } from "../../../src/infrastructure/crypto/node-crypto.adapter.js";
import type { SqlOperationGatewayPort } from "../../../src/domain/ports/persona-v2.port.js";
import type { SourceQueryLease } from "../../../src/domain/ports/source-query.port.js";
import { compileQueryTraining } from "../../../src/application/persona-v2/query-training.js";
import { queryTraining } from "../../helpers/persona-v2-training.js";
import { queryPublicationCaseSchema } from "../../../src/domain/persona-v2/publication-fixture.js";
import type { PublicationFixtureControlPort } from "../../../src/domain/ports/publication-fixture.port.js";

function fixture() {
  const source = { ...trainingSource, database: "se7e_persona_0123456789ab_test" };
  const crypto = new NodeCryptoAdapter("a".repeat(64));
  const training = operationTraining(source.id);
  const pkg = compileOperationTraining(training, source, crypto, "Case");
  const command = compileOperationCommand(pkg, source, randomUUID(), operationInput, crypto);
  const row = {
    id: operationInput.id,
    version: operationInput.version,
    amount: operationInput.amount,
  };
  const test = operationCaseSchema.parse({
    name: "Update",
    input: { parameters: operationInput, fixtures: [{ table: "orders", rows: [row] }] },
    expected: { affectedRows: 1, tables: [{ table: "orders", rows: [row] }] },
  });
  const control = {
    prepare: vi.fn<PublicationFixtureControlPort["prepare"]>(async () => Promise.resolve()),
    clear: vi.fn(async () => Promise.resolve()),
  };
  const execute = vi.fn<SourceQueryLease["execute"]>(async (sql) =>
    sql.includes("fixture_table")
      ? {
          columns: ["fixture_table", "fixture_rows"],
          rows: [{ fixture_table: "orders", fixture_rows: "1" }],
          truncated: false,
        }
      : {
          columns: ["id", "version", "amount"],
          rows: [{ id: 1, version: 2, amount: "42.5000" }],
          truncated: false,
        },
  );
  const reads = {
    authorize: vi.fn(async () => ({ execute, revalidate: async () => Promise.resolve() })),
  };
  const operations = {
    verifyCapabilitiesAndPolicy: vi.fn(async () => Promise.resolve()),
    execute: vi.fn<SqlOperationGatewayPort["execute"]>(async () => ({
      operationId: command.operationId,
      fingerprint: command.fingerprint,
      state: "concluida",
      executionId: randomUUID(),
      directlyAffectedRows: 1,
      completedAt: new Date().toISOString(),
    })),
    get: async () => null,
    cancel: vi.fn(),
  };
  const adapter = new BridgePublicationCaseExecutor(
    source,
    [
      {
        table: "orders",
        columns: training.tables[0]!.columns.map(({ name, type }) => ({ name, type })),
        primaryKey: ["id"],
      },
    ],
    control,
    reads,
    operations,
    { runId: source.database, agentId: source.agentId, identityHash: source.identityHash! },
  );
  return {
    source,
    pkg,
    command,
    test,
    control,
    execute,
    operations,
    run: () => adapter.evaluate(pkg, command, test),
  };
}
it("confere linhas e números exatos, limpa antes de concluir", async () => {
  const f = fixture();
  expect(await f.run()).toBe(true);
  expect(f.execute.mock.calls[1]?.[0]).toContain('CAST("amount" AS VARCHAR(128))');
  expect(f.control.clear).toHaveBeenCalledOnce();
});
it.each(["extra-row", "truncated"])("contagem %s nunca aprova fixture", async (kind) => {
  const f = fixture();
  f.execute.mockResolvedValue({
    columns: ["fixture_table", "fixture_rows"],
    rows: [{ fixture_table: "orders", fixture_rows: kind === "extra-row" ? "2" : "1" }],
    truncated: kind === "truncated",
  });
  expect(await f.run()).toBe(false);
  expect(f.execute).toHaveBeenCalledOnce();
});
it.each([false, true])(
  "autoriza todas as tabelas uma vez e revalida cada SELECT (revogação=%s)",
  async (revoked) => {
    const f = fixture();
    const revalidate = vi.fn(async () => {
      if (revoked) throw new Error("revoked");
    });
    const execute = vi.fn<SourceQueryLease["execute"]>(async (sql) =>
      sql.includes("fixture_table")
        ? {
            columns: ["fixture_table", "fixture_rows"],
            rows: [
              { fixture_table: "orders", fixture_rows: "1" },
              { fixture_table: "shadow", fixture_rows: "0" },
            ],
            truncated: false,
          }
        : {
            columns: ["id", "version", "amount"],
            rows: sql.includes('"shadow"') ? [] : [{ id: 1, version: 2, amount: "42.5" }],
            truncated: false,
          },
    );
    const authorize = vi.fn(async () => ({ execute, revalidate }));
    const columns = f.pkg.training.tables[0]!.columns.map(({ name, type }) => ({ name, type }));
    const adapter = new BridgePublicationCaseExecutor(
      f.source,
      [
        { table: "orders", columns, primaryKey: ["id"] },
        { table: "shadow", columns, primaryKey: ["id"] },
      ],
      f.control,
      { authorize },
      f.operations,
      { runId: f.source.database, agentId: f.source.agentId, identityHash: f.source.identityHash! },
    );
    f.test.input.fixtures.push({ table: "shadow", rows: [], generated: [] });
    if ("tables" in f.test.expected) f.test.expected.tables.push({ table: "shadow", rows: [] });
    if (revoked)
      await expect(adapter.evaluate(f.pkg, f.command, f.test)).rejects.toThrow("revoked");
    else expect(await adapter.evaluate(f.pkg, f.command, f.test)).toBe(true);
    expect(authorize).toHaveBeenCalledExactlyOnceWith(
      f.source,
      [
        { name: "orders", type: "table" },
        { name: "shadow", type: "table" },
      ],
      { exactResources: true, requireDatabase: true },
    );
    expect(execute).toHaveBeenCalledTimes(revoked ? 1 : 2);
    expect(revalidate).toHaveBeenCalledTimes(revoked ? 1 : 2);
  },
);
it.each([
  "SQL_OPERATION_NATIVE_FAILED",
  "SQL_OPERATION_TIMEOUT",
  "SQL_OPERATION_ROW_LIMIT",
] as const)("falha nativa esperada exige categoria exata e rollback: %s", async (failureCode) => {
  const f = fixture();
  f.test.expected = { error: "NATIVE_FAILURE" };
  f.operations.execute.mockResolvedValue({
    operationId: f.command.operationId,
    fingerprint: f.command.fingerprint,
    state: "rollback_confirmado",
    executionId: randomUUID(),
    directlyAffectedRows: 0,
    completedAt: new Date().toISOString(),
    failureCode,
  });
  expect(await f.run()).toBe(failureCode === "SQL_OPERATION_NATIVE_FAILED");
  expect(f.control.clear).toHaveBeenCalledOnce();
});
it("rollback nativo não aprova quando as sementes foram alteradas", async () => {
  const f = fixture();
  f.test.expected = { error: "NATIVE_FAILURE" };
  f.operations.execute.mockResolvedValue({
    operationId: f.command.operationId,
    fingerprint: f.command.fingerprint,
    state: "rollback_confirmado",
    executionId: randomUUID(),
    directlyAffectedRows: 0,
    completedAt: new Date().toISOString(),
    failureCode: "SQL_OPERATION_NATIVE_FAILED",
  });
  f.execute.mockResolvedValue({ columns: ["id", "version", "amount"], rows: [], truncated: false });
  expect(await f.run()).toBe(false);
});
it.each(["unknown", "transport", "receipt", "read", "prepare", "clear"])(
  "falha %s inutiliza fixture sem repetir operação",
  async (failure) => {
    const f = fixture();
    if (failure === "unknown")
      f.operations.execute.mockResolvedValue({
        operationId: f.command.operationId,
        fingerprint: f.command.fingerprint,
        state: "resultado_desconhecido",
        executionId: randomUUID(),
        directlyAffectedRows: null,
        completedAt: new Date().toISOString(),
      });
    if (failure === "transport") f.operations.execute.mockRejectedValue(new Error("transport"));
    if (failure === "receipt")
      f.operations.execute.mockResolvedValue({
        operationId: randomUUID(),
        fingerprint: f.command.fingerprint,
        state: "concluida",
        executionId: randomUUID(),
        directlyAffectedRows: 1,
        completedAt: new Date().toISOString(),
      });
    if (failure === "read") f.execute.mockRejectedValue(new Error("read timeout"));
    if (failure === "prepare") f.control.prepare.mockRejectedValue(new Error("prepare timeout"));
    if (failure === "clear") f.control.clear.mockRejectedValue(new Error("clear timeout"));
    await expect(f.run()).rejects.toThrow();
    await expect(f.run()).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    expect(f.operations.execute).toHaveBeenCalledTimes(failure === "prepare" ? 0 : 1);
    expect(f.control.clear).toHaveBeenCalledTimes(failure === "clear" ? 1 : 0);
  },
);
it("resultado truncado não aprova", async () => {
  const f = fixture();
  f.execute.mockResolvedValue({ columns: ["id", "version", "amount"], rows: [], truncated: true });
  expect(await f.run()).toBe(false);
  expect(f.control.clear).toHaveBeenCalledOnce();
});
it("fingerprint divergente recusa antes de preparar", async () => {
  const f = fixture();
  Object.assign(f.pkg, { sourceFingerprint: "wrong" });
  await expect(f.run()).rejects.toMatchObject({ code: "INVALID_PLAN" });
  expect(f.control.prepare).not.toHaveBeenCalled();
});

it("vínculo explícito testa fonte pretendida somente no banco da fixture", async () => {
  const f = fixture();
  const target = {
    ...f.source,
    id: randomUUID(),
    database: "business_never_connected",
    identityHash: "b".repeat(64),
    credentialId: randomUUID(),
  };
  const crypto = new NodeCryptoAdapter("a".repeat(64));
  const training = queryTraining(target.id);
  const pkg = compileQueryTraining(training, target, crypto);
  const authorize = vi.fn(async (source) => {
    expect(source.database).toBe(f.source.database);
    expect(source.credentialId).toBe(f.source.credentialId);
    return {
      execute: async () => ({
        columns: ["id", "amount"],
        rows: [{ id: 1, amount: "42.50" }],
        truncated: false,
      }),
      revalidate: async () => Promise.resolve(),
    };
  });
  const adapter = new BridgePublicationCaseExecutor(
    f.source,
    [
      {
        table: "orders",
        columns: [
          { name: "id", type: "integer" },
          { name: "version", type: "integer" },
          { name: "amount", type: "decimal" },
        ],
        primaryKey: ["id"],
      },
    ],
    f.control,
    { authorize },
    f.operations,
    { runId: f.source.database, agentId: f.source.agentId, identityHash: f.source.identityHash! },
    target,
  );
  const test = queryPublicationCaseSchema.parse({
    name: "Mesmo SQL na fixture",
    input: {
      params: { minimum: 0 },
      fixtures: [
        {
          table: "orders",
          rows: [
            {
              id: operationInput.id,
              version: operationInput.version,
              amount: operationInput.amount,
            },
          ],
        },
      ],
    },
    expected: {
      columns: [
        { name: "id", type: "integer" },
        { name: "amount", type: "decimal" },
      ],
      rows: [{ id: operationInput.id, amount: operationInput.amount }],
      ordered: true,
    },
  });
  expect(await adapter.evaluateQuery(pkg, target, test)).toBe(true);
  expect(authorize).toHaveBeenCalledOnce();
  expect(f.control.prepare.mock.calls[0]?.[0]).toBe(f.source);
  expect(adapter.evidence(target)).toMatchObject({
    sourceId: target.id,
    identityHash: target.identityHash,
    fixtureSourceId: f.source.id,
    fixtureIdentityHash: f.source.identityHash,
  });
});
