import { expect, it, vi } from "vitest";
import { SourceTokenManager } from "../../../src/infrastructure/plug-server/source-token-manager.js";
import { NodeCryptoAdapter } from "../../../src/infrastructure/crypto/node-crypto.adapter.js";
import type { Source } from "../../../src/domain/persona-v2/model.js";
import { FakePlugServer } from "../../helpers/fake-plug-server.js";
import { PersonaSourceQuery } from "../../../src/infrastructure/plug-server/persona-source-query.js";
import { PersonaSqlOperationGateway } from "../../../src/infrastructure/plug-server/persona-sql-operation.js";
import { DomainError } from "../../../src/domain/errors/domain-error.js";

it("compartilha login entre consulta e operação sem compartilhar autorização", async () => {
  const crypto = new NodeCryptoAdapter("a".repeat(64));
  const { trainingSource: source } = await import("../../helpers/persona-v2-training.js");
  const credentials = {
    find: async () => ({
      id: source.credentialId,
      personaId: source.personaId,
      version: 1,
      emailEnc: crypto.encrypt("fixture"),
      passwordEnc: crypto.encrypt("fixture"),
      clientTokenEnc: crypto.encrypt("fixture"),
    }),
  };
  const hub = new FakePlugServer();
  const login = vi.spyOn(hub, "login");
  const access = vi.spyOn(hub, "getAgentAccessStatus");
  const operationRpc = vi.fn();
  const sessions = new SourceTokenManager(credentials, hub, crypto);
  const query = new PersonaSourceQuery(credentials, hub, crypto, sessions);
  const operation = new PersonaSqlOperationGateway(
    credentials,
    hub,
    { operationRpc },
    crypto,
    "https://fixture.test",
    sessions,
  );
  await expect(query.authorize(source, [])).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  await expect(operation.get(source, "fixture", "fixture")).rejects.toMatchObject({
    code: "AUTHORIZATION_DENIED",
  });
  expect(login).toHaveBeenCalledTimes(1);
  expect(access).toHaveBeenCalledTimes(2);
  expect(operationRpc).not.toHaveBeenCalled();
  operation.discardCredentialSession(source.credentialId);
  await expect(query.authorize(source, [])).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  expect(login).toHaveBeenCalledTimes(2);
  const rejected = new DomainError({
    code: "USER_AUTH_EXPIRED",
    source: "plug_server_http",
    message: "fixture",
    hint: "fixture",
  });
  access.mockRejectedValueOnce(rejected);
  await expect(query.authorize(source, [])).rejects.toBe(rejected);
  expect(login).toHaveBeenCalledTimes(2);
  await expect(operation.get(source, "fixture", "fixture")).rejects.toMatchObject({
    code: "AUTHORIZATION_DENIED",
  });
  expect(login).toHaveBeenCalledTimes(3);
  expect(operationRpc).not.toHaveBeenCalled();
});

it("recusa tardia não remove JWT novo e falha temporária não invalida a sessão", async () => {
  const crypto = new NodeCryptoAdapter("a".repeat(64));
  const { trainingSource: source } = await import("../../helpers/persona-v2-training.js");
  const credentials = {
    find: async () => ({
      id: source.credentialId,
      personaId: source.personaId,
      version: 1,
      emailEnc: crypto.encrypt("fixture"),
      passwordEnc: crypto.encrypt("fixture"),
      clientTokenEnc: crypto.encrypt("fixture"),
    }),
  };
  const login = vi
    .fn()
    .mockResolvedValueOnce({ accessToken: "old", refreshToken: "fixture" })
    .mockResolvedValueOnce({ accessToken: "new", refreshToken: "fixture" });
  const manager = new SourceTokenManager(credentials, { login }, crypto);
  const old = await manager.getAccessToken(source);
  let reject!: (error: unknown) => void;
  const pending = manager.observe(
    old,
    () =>
      new Promise((_resolve, fail) => {
        reject = fail;
      }),
  );
  const failure = expect(pending).rejects.toMatchObject({ code: "USER_AUTH_EXPIRED" });
  manager.invalidate(source.credentialId);
  expect(await manager.getAccessToken(source)).toBe("new");
  reject(
    new DomainError({
      code: "USER_AUTH_EXPIRED",
      source: "plug_server_http",
      message: "fixture",
      hint: "fixture",
    }),
  );
  await failure;
  await expect(
    manager.observe("new", async () => {
      throw new DomainError({
        code: "AGENT_UNAVAILABLE",
        source: "plug_server_http",
        message: "fixture",
        hint: "fixture",
      });
    }),
  ).rejects.toMatchObject({ code: "AGENT_UNAVAILABLE" });
  expect(await manager.getAccessToken(source)).toBe("new");
  expect(login).toHaveBeenCalledTimes(2);
});

it.each([60, 3600, null])(
  "limita cache por exp=%s, preservando coalescência e invalidação",
  async (seconds) => {
    const crypto = new NodeCryptoAdapter("a".repeat(64));
    const { trainingSource: source } = await import("../../helpers/persona-v2-training.js");
    let now = 1_000_000;
    const credentials = {
      find: async () => ({
        id: source.credentialId,
        personaId: source.personaId,
        version: 1,
        emailEnc: crypto.encrypt("fixture"),
        passwordEnc: crypto.encrypt("fixture"),
        clientTokenEnc: crypto.encrypt("fixture"),
      }),
    };
    const login = vi.fn(async () => ({
      accessToken:
        seconds === null
          ? "opaque"
          : `header.${Buffer.from(JSON.stringify({ exp: now / 1000 + seconds })).toString("base64url")}.signature`,
      refreshToken: "fixture",
    }));
    const manager = new SourceTokenManager(credentials, { login }, crypto, () => now);
    await manager.getAccessToken(source);
    const ttl = seconds === null ? 30_000 : Math.min(300_000, seconds * 1000 - 5000);
    now += ttl - 1;
    await manager.getAccessToken(source);
    expect(login).toHaveBeenCalledTimes(1);
    now += 1;
    await Promise.all([manager.getAccessToken(source), manager.getAccessToken(source)]);
    expect(login).toHaveBeenCalledTimes(2);
    manager.invalidate(source.credentialId);
    await manager.getAccessToken(source);
    expect(login).toHaveBeenCalledTimes(3);
  },
);

it("isola JWT por credencial/versão, coalesce somente a mesma fonte e recusa rotação", async () => {
  const crypto = new NodeCryptoAdapter("a".repeat(64));
  let version = 1;
  const source: Source = {
    id: "source-a",
    personaId: "persona",
    physicalSourceId: "physical",
    name: "A",
    purpose: "test",
    environment: "test",
    agentId: "agent",
    database: "db",
    dialect: "postgres",
    credentialId: "cred-a",
    credentialVersion: 1,
    authorizationVersion: 1,
    active: true,
  };
  const credentials = {
    find: async (_personaId: string, id: string) => ({
      id,
      personaId: "persona",
      version,
      emailEnc: crypto.encrypt(`${id}@fixture.test`),
      passwordEnc: crypto.encrypt("fixture"),
      clientTokenEnc: crypto.encrypt("client-token"),
    }),
  };
  const login = vi.fn(async (email: string) => ({
    accessToken: `jwt:${email}`,
    refreshToken: "refresh",
  }));
  const manager = new SourceTokenManager(credentials, { login }, crypto);
  const first = await Promise.all([manager.getAccessToken(source), manager.getAccessToken(source)]);
  expect(first).toEqual(["jwt:cred-a@fixture.test", "jwt:cred-a@fixture.test"]);
  expect(login).toHaveBeenCalledTimes(1);
  expect(await manager.getAccessToken({ ...source, id: "source-b", credentialId: "cred-b" })).toBe(
    "jwt:cred-b@fixture.test",
  );
  expect(login).toHaveBeenCalledTimes(2);
  version = 2;
  await expect(manager.getAccessToken(source)).rejects.toMatchObject({
    code: "STALE_AUTHORIZATION",
  });
  await manager.getAccessToken({ ...source, credentialVersion: 2 });
  expect(login).toHaveBeenCalledTimes(3);
});

it("descarta login em voo invalidado e não remove o login novo ao finalizar o antigo", async () => {
  const crypto = new NodeCryptoAdapter("a".repeat(64));
  const { trainingSource: source } = await import("../../helpers/persona-v2-training.js");
  const credentials = {
    find: async () => ({
      id: source.credentialId,
      personaId: source.personaId,
      version: 1,
      emailEnc: crypto.encrypt("fixture@test.test"),
      passwordEnc: crypto.encrypt("fixture"),
      clientTokenEnc: crypto.encrypt("fixture"),
    }),
  };
  const finishes: ((value: { accessToken: string; refreshToken: string }) => void)[] = [];
  const login = vi.fn(
    () =>
      new Promise<{ accessToken: string; refreshToken: string }>((resolve) => {
        finishes.push(resolve);
      }),
  );
  const manager = new SourceTokenManager(credentials, { login }, crypto);
  const first = manager.getAccessToken(source);
  const rejected = expect(first).rejects.toMatchObject({ code: "STALE_AUTHORIZATION" });
  await vi.waitFor(() => expect(login).toHaveBeenCalledTimes(1));
  manager.invalidate(source.credentialId);
  const next = manager.getAccessToken(source);
  await vi.waitFor(() => expect(login).toHaveBeenCalledTimes(2));
  finishes[0]!({ accessToken: "discarded", refreshToken: "discarded" });
  await rejected;
  const coalesced = manager.getAccessToken(source);
  finishes[1]!({ accessToken: "current", refreshToken: "current" });
  expect(await Promise.all([next, coalesced])).toEqual(["current", "current"]);
  expect(await manager.getAccessToken(source)).toBe("current");
  expect(login).toHaveBeenCalledTimes(2);
});
