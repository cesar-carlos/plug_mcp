import { expect, it, vi } from "vitest";
import { PersonaIntegrationManagement } from "../../../src/application/persona-v2/integration-management.js";
import type { PersonaAdministration } from "../../../src/application/persona-v2/administration.js";
import type {
  PersonaServices,
  PersonaTransaction,
} from "../../../src/domain/ports/persona-v2.port.js";
import type {
  AuthorizationSnapshot,
  ConsumerIdentity,
} from "../../../src/domain/persona-v2/model.js";
import type { ManagedIntegration } from "../../../src/domain/persona-v2/integration-management.js";

it("escopo explícito limita listagem, impacto e suspensão; OAuth não herda o escopo", async () => {
  const now = new Date();
  const identity: ConsumerIdentity = {
    personaId: "persona",
    tokenId: "token",
    tokenVersion: 1,
    personaVersion: 1,
  };
  const permissions = {
    sourceIds: [],
    skills: [],
    externalOperationIds: [],
    administrative: ["gerenciar_integracoes"] as const,
  };
  let state: AuthorizationSnapshot = {
    persona: {
      id: "persona",
      ownerId: "owner",
      name: "Fixture",
      specialty: "",
      instructions: "",
      active: true,
      authorizationVersion: 1,
    },
    token: {
      id: "token",
      personaId: "persona",
      tokenHash: "",
      expiresAt: null,
      revokedAt: null,
      authorizationVersion: 1,
      permissions,
      delegation: permissions,
    },
    sources: [],
  };
  const connections: ManagedIntegration[] = ["a", "b"].map((id) => ({
    id,
    name: id,
    kind: "rest",
    destination: "https://fixture.example",
    version: 1,
    managementVersion: 1,
    active: true,
    suspendedAt: null,
  }));
  const impact = vi.fn(async () => ({
    connection: connections[0]!,
    publications: [],
    activeOperations: 0,
    pendingOperations: 0,
  }));
  const changeState = vi.fn(async () => undefined);
  const tx = {
    external: { connections: async () => connections, impact, changeState },
  } as unknown as PersonaTransaction;
  const service = new PersonaIntegrationManagement(
    { now: () => now, crypto: { sha256Hex: () => "a".repeat(64) } } as unknown as PersonaServices,
    {} as PersonaAdministration,
    {
      run: async (_actor, _persona, _permission, action) =>
        action(tx, { ownerId: "owner", binding: "fixture", state }),
    },
  );
  expect(await service.list(identity, "persona")).toEqual([]);
  await expect(service.review(identity, "persona", "a")).rejects.toMatchObject({
    code: "AUTHORIZATION_DENIED",
  });
  expect(impact).not.toHaveBeenCalled();
  state = {
    ...state,
    token: { ...state.token, permissions: { ...permissions, managedIntegrationIds: ["a"] } },
  };
  expect((await service.list(identity, "persona")).map((v) => v.id)).toEqual(["a"]);
  await expect(service.review(identity, "persona", "b")).rejects.toMatchObject({
    code: "AUTHORIZATION_DENIED",
  });
  const review = await service.review(identity, "persona", "a");
  const input = { expectedVersion: 1, fingerprint: review.fingerprint, confirmed: true };
  await expect(
    service.state(identity, "persona", "a", true, { ...input, expectedVersion: 2 }),
  ).rejects.toMatchObject({ code: "OPERATION_CONFLICT" });
  expect(changeState).not.toHaveBeenCalled();
  await service.state(identity, "persona", "a", true, input);
  expect(changeState).toHaveBeenCalledOnce();
  const grantIdentity = { ...identity, grant: { id: "grant" } };
  state = {
    ...state,
    grant: {
      id: "grant",
      personaId: "persona",
      tokenId: "token",
      tokenVersion: 1,
      permissions,
      expiresAt: new Date(now.getTime() + 60000),
      revokedAt: null,
    },
  };
  await expect(service.state(grantIdentity, "persona", "a", true, input)).rejects.toMatchObject({
    code: "AUTHORIZATION_DENIED",
  });
  expect(changeState).toHaveBeenCalledOnce();
});
