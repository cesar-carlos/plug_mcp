import { describe, expect, it, vi } from "vitest";
import { PlugServerRestAdapter } from "../../../src/infrastructure/plug-server/plug-server-rest.adapter.js";
import { PersonaSourceVerifier } from "../../../src/infrastructure/plug-server/persona-source-verifier.js";
import { SilentTestLogger } from "../../helpers/silent-logger.js";
import type { ClientTokenPolicy } from "../../../src/domain/ports/plug-server-gateway.port.js";
import { sourceProof } from "../../helpers/persona-v2-training.js";

describe("identidade e portões de fontes no hub", () => {
  it("perfil usa client.id, nunca userId ou email, e recusa perfil sem ID", async () => {
    let profile: unknown = {
      client: {
        id: "client-id",
        userId: "upstream-owner",
        email: "old@fixture.test",
        status: "active",
      },
    };
    const fetcher: typeof fetch = async () =>
      new Response(JSON.stringify(profile), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    const hub = new PlugServerRestAdapter("http://hub.test", new SilentTestLogger(), fetcher);
    expect(await hub.getClientProfile("fixture-jwt")).toEqual({
      clientId: "client-id",
      active: true,
    });
    profile = { client: { userId: "upstream-owner", email: "old@fixture.test", status: "active" } };
    await expect(hub.getClientProfile("fixture-jwt")).rejects.toMatchObject({
      code: "PLUG_SERVER_ERROR",
    });
  });
  it("cadastro exige os três portões e respeita banco obrigatório/revogação", async () => {
    const input = {
      agentId: "agent",
      database: "erp",
      dialect: "postgres" as const,
      email: "client-b@fixture.test",
      password: "password",
      clientToken: "client-token",
    };
    const login = vi.fn(async () => ({ accessToken: "jwt-b", refreshToken: "refresh" }));
    let approved = true;
    const full: NonNullable<ClientTokenPolicy["fullPolicy"]> = {
      allViews: false,
      allPermissions: false,
      revoked: false,
      database: "erp",
      globalPermissions: { read: true, update: false, delete: false, ddl: false },
      rules: [],
    };
    let policy: ClientTokenPolicy = { allTables: true, tables: [], fullPolicy: full };
    const getPolicy = vi.fn(async () => policy);
    const verifier = new PersonaSourceVerifier({
      login,
      getAgentAccessStatus: async () => ({
        agentId: "agent",
        state: approved ? "approved" : "revoked",
        sourceIdentity: 1,
        hasClientToken: true,
        isHubConnected: true,
      }),
      getClientTokenPolicy: getPolicy,
      describeSource: async () => sourceProof(input),
    });
    const expected = {
      database: "erp",
      dialect: "postgres",
      identityHash: "f".repeat(64),
      verifiedAt: "2026-10-11T00:00:00.000Z",
    };
    await expect(verifier.verify(input)).resolves.toEqual(expected);
    await expect(verifier.verify({ ...input, database: undefined })).resolves.toEqual(expected);
    expect(login).toHaveBeenCalledWith(input.email, input.password);
    expect(getPolicy).toHaveBeenCalledWith({
      accessToken: "jwt-b",
      agentId: input.agentId,
      clientToken: input.clientToken,
    });
    approved = false;
    await expect(verifier.verify(input)).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    approved = true;
    policy = { ...policy, fullPolicy: { ...full, revoked: true } };
    await expect(verifier.verify(input)).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    policy = { ...policy, fullPolicy: { ...full, database: "another" } };
    await expect(verifier.verify(input)).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
    policy = { ...policy, fullPolicy: { ...full, database: null } };
    await expect(verifier.verify({ ...input, database: undefined })).rejects.toMatchObject({
      code: "CAPABILITY_UNAVAILABLE",
    });
    policy = { ...policy, fullPolicy: { ...full, database: "   " } };
    await expect(verifier.verify({ ...input, database: undefined })).rejects.toMatchObject({
      code: "CAPABILITY_UNAVAILABLE",
    });
    policy = { allTables: true, tables: [] };
    await expect(verifier.verify(input)).rejects.toMatchObject({ code: "CAPABILITY_UNAVAILABLE" });
  });
});
