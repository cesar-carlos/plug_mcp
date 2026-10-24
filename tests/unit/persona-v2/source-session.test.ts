import { expect, it, vi } from "vitest";
import { SourceTokenManager } from "../../../src/infrastructure/plug-server/source-token-manager.js";
import { NodeCryptoAdapter } from "../../../src/infrastructure/crypto/node-crypto.adapter.js";
import type { Source } from "../../../src/domain/persona-v2/model.js";

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
