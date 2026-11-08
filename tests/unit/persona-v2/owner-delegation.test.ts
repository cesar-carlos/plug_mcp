import { expect, it, vi } from "vitest";
import { PersonaOwnerDelegation } from "../../../src/application/persona-v2/owner-delegation.js";
import type { PersonaAdministration } from "../../../src/application/persona-v2/administration.js";
import type {
  PersonaServices,
  PersonaTransaction,
} from "../../../src/domain/ports/persona-v2.port.js";
import type { OwnerDelegation } from "../../../src/domain/ports/persona-security.port.js";
import { PersonaV2Error } from "../../../src/domain/persona-v2/model.js";
import type {
  AuthorizationSnapshot,
  ConsumerIdentity,
  Permissions,
} from "../../../src/domain/persona-v2/model.js";

function fixture() {
  const now = new Date("2026-11-08T00:00:00Z");
  const persona = {
    id: "persona",
    ownerId: "owner",
    active: true,
    authorizationVersion: 1,
    name: "Fixture",
    specialty: "Fixture",
    instructions: "",
  };
  const permissions: Permissions = {
    sourceIds: [],
    skills: [],
    externalOperationIds: [],
    administrative: ["gerenciar_fontes"],
  };
  const state = {
    persona,
    token: {
      id: "token",
      personaId: persona.id,
      tokenHash: "synthetic",
      expiresAt: null as Date | null,
      revokedAt: null as Date | null,
      authorizationVersion: 1,
      permissions,
      delegation: permissions,
    },
    sources: [],
    grant: {
      id: "grant",
      personaId: persona.id,
      tokenId: "token",
      tokenVersion: 1,
      permissions,
      expiresAt: new Date(now.getTime() + 60000),
      revokedAt: null as Date | null,
    },
  } satisfies AuthorizationSnapshot;
  const identity: ConsumerIdentity = {
    personaId: persona.id,
    tokenId: "token",
    tokenVersion: 1,
    personaVersion: 1,
    grant: { id: "grant" },
  };
  const session = {
    owner: { id: "owner", hubClientId: "client" },
    accessToken: "synthetic-jwt",
    expiresAt: new Date(now.getTime() + 60000),
  };
  let delegation: OwnerDelegation = {
    personaId: persona.id,
    ownerId: persona.ownerId,
    hubId: "old",
    credentialEnc: "synthetic-cipher",
    administrative: ["gerenciar_fontes"],
    expiresAt: new Date(now.getTime() + 3600000),
    revokedAt: null,
    version: 1,
  };
  const beforeRead = vi.fn();
  const save = vi.fn(async (value: OwnerDelegation, expected: number) => {
    if (delegation.version !== expected)
      throw new PersonaV2Error("OPERATION_CONFLICT", "Delegação mudou.");
    delegation = value;
  });
  const tx = {
    authorization: async () => state,
    owner: async () => session.owner,
    findPersona: async () => persona,
    setAdministrativeActor: async () => undefined,
    security: { delegation: async () => delegation, saveDelegation: save },
  } as unknown as PersonaTransaction;
  const services = {
    now: () => now,
    crypto: { encrypt: () => "synthetic-cipher", decrypt: () => "synthetic-credential" },
    ownerAuth: { hubOrigin: "https://fixture.test" },
    repository: {
      transaction: async <T>(_locks: unknown, action: (tx: PersonaTransaction) => Promise<T>) => {
        beforeRead();
        return action(tx);
      },
    },
  } as unknown as PersonaServices;
  const admin = { validateSession: async () => session } as unknown as PersonaAdministration;
  const hub = {
    revoke: vi.fn(async () => undefined),
    verify: vi.fn(async () => ({
      id: "old",
      clientId: "client",
      audience: "https://fixture.test",
      personaId: persona.id,
      expiresAt: delegation.expiresAt.toISOString(),
      administrative: ["gerenciar_fontes" as const],
      active: true as const,
    })),
    create: vi.fn(async () => ({
      id: "new",
      clientId: "client",
      audience: "https://fixture.test",
      personaId: persona.id,
      expiresAt: delegation.expiresAt.toISOString(),
      credential: `pdv2_${"a".repeat(43)}`,
      administrative: ["gerenciar_fontes" as const],
    })),
  };
  const service = new PersonaOwnerDelegation(services, admin, hub, "https://fixture.test");
  const renewElsewhere = () => {
    delegation = { ...delegation, version: 2, hubId: "winner" };
  };
  return { service, hub, beforeRead, persona, session, now, save, renewElsewhere, state, identity };
}

it.each(["revoked", "expired", "version", "owner", "grant_revoked", "grant_expired"])(
  "recusa prova remota após mudança %s do consumidor",
  async (change) => {
    const f = fixture();
    f.beforeRead
      .mockImplementationOnce(() => undefined)
      .mockImplementationOnce(() => {
        if (change === "grant_revoked") f.state.grant.revokedAt = f.now;
        if (change === "grant_expired") f.state.grant.expiresAt = f.now;
        if (change === "revoked") f.state.token.revokedAt = f.now;
        if (change === "expired") f.state.token.expiresAt = f.now;
        if (change === "version") f.state.token.authorizationVersion++;
        if (change === "owner") f.persona.ownerId = "another-owner";
      });
    await expect(f.service.verify(f.identity)).rejects.toMatchObject({
      code: change === "version" ? "STALE_AUTHORIZATION" : "AUTHORIZATION_DENIED",
    });
    expect(f.hub.verify).toHaveBeenCalledTimes(1);
    expect(f.hub.create).not.toHaveBeenCalled();
    expect(f.hub.revoke).not.toHaveBeenCalled();
  },
);

it("entrega a prova apenas ao consumidor ainda autorizado", async () => {
  const f = fixture();
  await expect(f.service.verify(f.identity)).resolves.toMatchObject({ hubId: "old", version: 1 });
  expect(f.beforeRead).toHaveBeenCalledTimes(2);
});

it.each(["create", "revoke"] as const)(
  "não repete renovação após resposta perdida em %s",
  async (step) => {
    const f = fixture();
    const failure = new Error("synthetic transport interruption");
    f.hub[step].mockRejectedValueOnce(failure);
    await expect(f.service.create("session", "persona", 1)).rejects.toBe(failure);
    expect(f.hub.revoke).toHaveBeenCalledTimes(1);
    expect(f.hub.create).toHaveBeenCalledTimes(step === "create" ? 1 : 0);
    expect(f.save).not.toHaveBeenCalled();
  },
);

it("mantém revogação local quando a confirmação remota se perde", async () => {
  const f = fixture();
  f.hub.revoke.mockRejectedValueOnce(new Error("synthetic transport interruption"));
  await expect(f.service.revoke("session", "persona", 1)).rejects.toThrow(
    "synthetic transport interruption",
  );
  await expect(f.service.status("session", "persona")).resolves.toMatchObject({
    active: false,
    version: 2,
  });
  await expect(f.service.verify(f.identity)).rejects.toMatchObject({
    code: "AUTHORIZATION_DENIED",
  });
  expect(f.hub.revoke).toHaveBeenCalledTimes(1);
  expect(f.hub.verify).not.toHaveBeenCalled();
});

it("não revoga a renovação concorrente ocorrida depois da leitura de status", async () => {
  const f = fixture();
  f.beforeRead.mockImplementationOnce(() => undefined).mockImplementationOnce(f.renewElsewhere);
  await expect(f.service.create("session", "persona", 1)).rejects.toMatchObject({
    code: "OPERATION_CONFLICT",
  });
  expect(f.hub.revoke).not.toHaveBeenCalled();
  expect(f.hub.create).not.toHaveBeenCalled();
  expect(f.save).not.toHaveBeenCalled();
});

it.each(["inactive", "owner", "expired"])("revalida %s antes de efeitos no hub", async (change) => {
  const f = fixture();
  f.beforeRead
    .mockImplementationOnce(() => undefined)
    .mockImplementationOnce(() => {
      if (change === "inactive") f.persona.active = false;
      if (change === "owner") f.persona.ownerId = "another-owner";
      if (change === "expired") f.session.expiresAt = f.now;
    });
  await expect(f.service.create("session", "persona", 1)).rejects.toMatchObject({
    code: "AUTHORIZATION_DENIED",
  });
  expect(f.hub.revoke).not.toHaveBeenCalled();
  expect(f.hub.create).not.toHaveBeenCalled();
});

it("renova a versão vigente e mantém compensação exclusiva da nova credencial em conflito tardio", async () => {
  const success = fixture();
  await expect(success.service.create("session", "persona", 1)).resolves.toMatchObject({
    version: 2,
    active: true,
  });
  expect(success.hub.revoke).toHaveBeenCalledExactlyOnceWith("synthetic-jwt", "old");
  const conflict = fixture();
  conflict.beforeRead
    .mockImplementationOnce(() => undefined)
    .mockImplementationOnce(() => undefined)
    .mockImplementationOnce(conflict.renewElsewhere);
  await expect(conflict.service.create("session", "persona", 1)).rejects.toMatchObject({
    code: "OPERATION_CONFLICT",
  });
  expect(conflict.hub.revoke.mock.calls).toEqual([
    ["synthetic-jwt", "old"],
    ["synthetic-jwt", "new"],
  ]);
});
