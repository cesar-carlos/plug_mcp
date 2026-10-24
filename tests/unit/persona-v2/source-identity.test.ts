import { expect, it, vi } from "vitest";
import {
  requireDurableSource,
  sourceIdentityMatches,
} from "../../../src/domain/persona-v2/source-discovery.js";
import { verifySourceIdentity } from "../../../src/infrastructure/plug-server/verify-source-identity.js";
import { PlugServerRestAdapter } from "../../../src/infrastructure/plug-server/plug-server-rest.adapter.js";
import type { PlugServerGatewayPort } from "../../../src/domain/ports/plug-server-gateway.port.js";
import { SilentTestLogger } from "../../helpers/silent-logger.js";
import { sourceProof, trainingSource } from "../../helpers/persona-v2-training.js";

it("SQL Anywhere exige identidade provisionada; essa modalidade não substitui a prova nativa dos outros motores", () => {
  const source = { ...trainingSource, dialect: "sybase" as const };
  const proof = { ...sourceProof(source), identityKind: "provisioned" as const };
  expect(requireDurableSource(proof, source)).toEqual(proof);
  expect(sourceIdentityMatches(source, proof)).toBe(true);
  for (const identityKind of ["native", "locator"] as const) {
    expect(() => requireDurableSource({ ...proof, identityKind }, source)).toThrow();
    expect(sourceIdentityMatches(source, { ...proof, identityKind })).toBe(false);
  }
  expect(() =>
    requireDurableSource({ ...sourceProof(), identityKind: "provisioned" }, trainingSource),
  ).toThrow();
  expect(
    sourceIdentityMatches(trainingSource, { ...sourceProof(), identityKind: "provisioned" }),
  ).toBe(false);
});

it("cadastro recusa dialeto/banco divergentes, identidade por localizador e prova incompleta", () => {
  for (const proof of [
    { ...sourceProof(), dialect: "mssql" },
    { ...sourceProof(), database: "other" },
    { ...sourceProof(), identityKind: "locator" },
    { ...sourceProof(), identityHash: "name-only" },
  ])
    expect(() => requireDurableSource(proof, trainingSource)).toThrow();
  expect(requireDurableSource(sourceProof(), trainingSource).identityHash).toBe(
    trainingSource.identityHash,
  );
});
it("substituição com mesmo nome suspende a fonte, mas falha de transporte não é prova de substituição", async () => {
  const describeSource = vi.fn(async (): Promise<unknown> => sourceProof());
  const hub = { describeSource } as unknown as PlugServerGatewayPort;
  const invalidateIdentity = vi.fn(() => Promise.resolve());
  const credentials = { find: vi.fn(), invalidateIdentity };
  const carrier = { accessToken: "fixture-jwt", clientToken: "fixture-token" };
  await verifySourceIdentity(hub, credentials, trainingSource, carrier);
  expect(invalidateIdentity).not.toHaveBeenCalled();
  describeSource.mockRejectedValueOnce(new Error("network unavailable"));
  await expect(verifySourceIdentity(hub, credentials, trainingSource, carrier)).rejects.toThrow();
  expect(invalidateIdentity).not.toHaveBeenCalled();
  describeSource.mockResolvedValueOnce({ ...sourceProof(), identityHash: "a".repeat(64) });
  await expect(
    verifySourceIdentity(hub, credentials, trainingSource, carrier),
  ).rejects.toMatchObject({ code: "STALE_AUTHORIZATION" });
  expect(invalidateIdentity).toHaveBeenCalledWith(trainingSource);
});
it("fonte antiga sem prova e hub antigo não autorizam execução", async () => {
  const hub = { describeSource: vi.fn() } as unknown as PlugServerGatewayPort;
  const credentials = { find: vi.fn() };
  const carrier = { accessToken: "fixture-jwt", clientToken: "fixture-token" };
  await expect(
    verifySourceIdentity(hub, credentials, { ...trainingSource, identityHash: undefined }, carrier),
  ).rejects.toMatchObject({ code: "CAPABILITY_UNAVAILABLE" });
  expect(hub.describeSource).not.toHaveBeenCalled();
  await expect(
    verifySourceIdentity({} as PlugServerGatewayPort, credentials, trainingSource, carrier),
  ).rejects.toMatchObject({ code: "CAPABILITY_UNAVAILABLE" });
});
it("adapter encaminha RPC tipado ao hub com credencial da fonte, sem SQL fornecido pela IA", async () => {
  const fetcher = vi.fn<typeof fetch>(
    async () =>
      new Response(JSON.stringify({ response: { item: { result: sourceProof() } } }), {
        status: 200,
      }),
  );
  const hub = new PlugServerRestAdapter(
    "https://hub.fixture.test",
    new SilentTestLogger(),
    fetcher,
  );
  expect(
    await hub.describeSource({
      accessToken: "jwt",
      agentId: trainingSource.agentId,
      clientToken: "technical",
      database: trainingSource.database,
    }),
  ).toEqual(sourceProof());
  const [url, init] = fetcher.mock.calls[0]!;
  expect(url).toBe("https://hub.fixture.test/api/v1/agents/commands");
  expect(JSON.parse(String(init?.body))).toMatchObject({
    agentId: trainingSource.agentId,
    command: {
      method: "sql.describeSource",
      params: { contractVersion: 1, database: trainingSource.database, client_token: "technical" },
    },
  });
  expect(String(init?.body)).not.toContain('"sql"');
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("adapter preserva expectedSource em SELECT e journal sem fallback para execução sem prova", async () => {
  const expectedSource = {
    version: 1 as const,
    dialect: trainingSource.dialect,
    identityHash: trainingSource.identityHash!,
  };
  const fetcher = vi.fn<typeof fetch>(
    async () =>
      new Response(
        JSON.stringify({ response: { item: { result: { columns: ["id"], rows: [] } } } }),
        { status: 200 },
      ),
  );
  const hub = new PlugServerRestAdapter(
    "https://hub.fixture.test",
    new SilentTestLogger(),
    fetcher,
  );
  const carrier = { accessToken: "jwt", agentId: trainingSource.agentId, clientToken: "technical" };
  await hub.executeSql({
    ...carrier,
    database: trainingSource.database,
    expectedSource,
    sql: "SELECT id FROM fixture",
  });
  expect(JSON.parse(String(fetcher.mock.calls[0]![1]?.body)).command.params.expectedSource).toEqual(
    expectedSource,
  );
  await hub.operationRpc({
    ...carrier,
    sourcePhysicalId: "a".repeat(64),
    expectedSource,
    method: "sql.operation.get",
    reference: {
      operationId: "11111111-1111-4111-8111-111111111111",
      fingerprint: "b".repeat(64),
      database: trainingSource.database,
    },
  });
  expect(JSON.parse(String(fetcher.mock.calls[1]![1]?.body)).command.params).toMatchObject({
    expectedSource,
    sourcePhysicalId: "a".repeat(64),
  });
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("recusa de identidade na conexão executora não é erro de SQL e não sugere retry", async () => {
  const fetcher = vi.fn<typeof fetch>(
    async () =>
      new Response(
        JSON.stringify({
          response: {
            item: {
              error: {
                code: -32009,
                data: {
                  failure_code: "SOURCE_IDENTITY_MISMATCH",
                  technical_message: "untrusted metadata",
                },
              },
            },
          },
        }),
        { status: 200 },
      ),
  );
  const hub = new PlugServerRestAdapter(
    "https://hub.fixture.test",
    new SilentTestLogger(),
    fetcher,
  );
  await expect(
    hub.executeSql({
      accessToken: "jwt",
      agentId: trainingSource.agentId,
      clientToken: "technical",
      database: trainingSource.database,
      sql: "SELECT id FROM fixture",
      expectedSource: {
        version: 1,
        dialect: trainingSource.dialect,
        identityHash: trainingSource.identityHash!,
      },
    }),
  ).rejects.toMatchObject({
    code: "CREDENTIAL_STALE",
    retryable: false,
    source: "client_token_rpc",
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
