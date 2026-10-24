import { describe, expect, it } from "vitest";
import {
  assertAdministrativePermission,
  assertConsumer,
  assertDelegation,
  authorizePublication,
  permissionsContainedBy,
  resolveSource,
} from "../../../src/domain/persona-v2/authorization.js";
import type {
  AuthorizationSnapshot,
  ConsumerIdentity,
  Permissions,
  PublicationAuthority,
} from "../../../src/domain/persona-v2/model.js";

const now = new Date("2026-10-10T12:00:00Z");
it("escopo administrativo de integração não amplia tokens ou tetos anteriores", () => {
  const empty: Permissions = {
    sourceIds: [],
    skills: [],
    externalOperationIds: [],
    administrative: ["gerenciar_integracoes"],
  };
  const first = { ...empty, managedIntegrationIds: ["integration-a"] };
  expect(permissionsContainedBy(first, empty)).toBe(false);
  expect(permissionsContainedBy(empty, first)).toBe(true);
  expect(permissionsContainedBy(first, first)).toBe(true);
  expect(
    permissionsContainedBy({ ...first, managedIntegrationIds: ["integration-b"] }, first),
  ).toBe(false);
});
const permissions: Permissions = {
  sourceIds: ["source"],
  skills: [
    {
      skillId: "skill",
      capabilities: ["table:orders", "column:orders.id"],
      effects: ["select"],
      requireHumanApproval: false,
    },
  ],
  externalOperationIds: [],
  administrative: ["treinar", "gerenciar_tokens"],
};
const identity: ConsumerIdentity = {
  personaId: "persona",
  tokenId: "token",
  tokenVersion: 1,
  personaVersion: 1,
};
const state: AuthorizationSnapshot = {
  persona: {
    id: "persona",
    ownerId: "owner",
    name: "Analista",
    specialty: "Financeiro",
    instructions: "",
    active: true,
    authorizationVersion: 1,
  },
  token: {
    id: "token",
    personaId: "persona",
    tokenHash: "hash",
    expiresAt: null,
    revokedAt: null,
    authorizationVersion: 1,
    permissions,
    delegation: permissions,
  },
  sources: [
    {
      id: "source",
      personaId: "persona",
      physicalSourceId: "physical",
      name: "ERP",
      purpose: "financeiro",
      environment: "test",
      agentId: "agent",
      database: "erp",
      dialect: "postgres",
      credentialId: "credential",
      credentialVersion: 1,
      authorizationVersion: 1,
      active: true,
    },
  ],
};
const publication: PublicationAuthority = {
  id: "publication",
  personaId: "persona",
  skillId: "skill",
  kind: "consulta",
  sourceIds: ["source"],
  externalOperationIds: [],
  requiredCapabilities: ["table:orders", "column:orders.id"],
  effects: ["select"],
  hash: "hash",
  suspendedAt: null,
  approval: "automatic",
};
describe("persona-v2: mesma autorização em descoberta e execução", () => {
  it("finalidade nova exige concessão do token e consentimento OAuth; delegação não amplia", () => {
    const atom = "field-use:source:public.orders.id:filtro";
    const expanded = {
      ...publication,
      requiredCapabilities: [...publication.requiredCapabilities, atom],
    };
    expect(() => authorizePublication(identity, state, expanded, now)).toThrow();
    const granted = {
      ...permissions,
      skills: [
        { ...permissions.skills[0]!, capabilities: [...permissions.skills[0]!.capabilities, atom] },
      ],
    };
    const current = { ...state, token: { ...state.token, permissions: granted } };
    expect(() => authorizePublication(identity, current, expanded, now)).not.toThrow();
    expect(() =>
      authorizePublication(
        { ...identity, grant: { id: "grant" } },
        {
          ...current,
          grant: {
            id: "grant",
            personaId: identity.personaId,
            tokenId: identity.tokenId,
            tokenVersion: 1,
            permissions,
            expiresAt: new Date(now.getTime() + 1000),
            revokedAt: null,
          },
        },
        expanded,
        now,
      ),
    ).toThrow();
    expect(permissionsContainedBy(granted, permissions)).toBe(false);
  });
  it("autoriza somente publicação e concessão explícitas", () => {
    expect(authorizePublication(identity, state, publication, now)).toEqual({
      requireHumanApproval: false,
    });
    expect(() =>
      authorizePublication(identity, state, { ...publication, skillId: "new" }, now),
    ).toThrow("concessão");
  });
  it.each([
    { requiredCapabilities: [...publication.requiredCapabilities, "column:orders.salary"] },
    { effects: ["update"] as const },
    { sourceIds: ["source", "new-source"] },
    { externalOperationIds: ["external"] },
    { personaId: "other" },
    { suspendedAt: now },
  ])("não amplia token com republicação: %j", (change) => {
    expect(() =>
      authorizePublication(identity, state, { ...publication, ...change }, now),
    ).toThrow();
  });
  it("recusa revogação e contexto antigo imediatamente", () => {
    expect(() =>
      assertConsumer(identity, { ...state, token: { ...state.token, revokedAt: now } }, now),
    ).toThrow();
    expect(() =>
      assertConsumer(
        identity,
        { ...state, token: { ...state.token, authorizationVersion: 2 } },
        now,
      ),
    ).toThrow();
    expect(() =>
      assertConsumer(
        identity,
        { ...state, persona: { ...state.persona, authorizationVersion: 2 } },
        now,
      ),
    ).toThrow();
    expect(() =>
      assertConsumer(identity, { ...state, token: { ...state.token, expiresAt: now } }, now),
    ).toThrow();
  });
  it("não aceita fonte de outra persona mesmo que tenha ID concedido", () => {
    expect(() =>
      authorizePublication(
        identity,
        { ...state, sources: [{ ...state.sources[0]!, personaId: "other" }] },
        publication,
        now,
      ),
    ).toThrow();
  });
  it("OAuth preserva consentimento mesmo se token original ampliou capacidades", () => {
    const delegated: ConsumerIdentity = {
      ...identity,
      grant: {
        id: "grant",
      },
    };
    const delegatedState: AuthorizationSnapshot = {
      ...state,
      grant: {
        id: "grant",
        personaId: "persona",
        tokenId: "token",
        tokenVersion: 1,
        permissions: { ...permissions, skills: [] },
        expiresAt: new Date(now.getTime() + 1000),
        revokedAt: null,
      },
    };
    expect(() => assertConsumer(delegated, delegatedState, now)).not.toThrow();
    expect(() => authorizePublication(delegated, delegatedState, publication, now)).toThrow();
    expect(() =>
      assertConsumer(
        delegated,
        { ...delegatedState, grant: { ...delegatedState.grant!, revokedAt: now } },
        now,
      ),
    ).toThrow();
    expect(() =>
      assertConsumer(
        delegated,
        { ...delegatedState, grant: { ...delegatedState.grant!, tokenVersion: 0 } },
        now,
      ),
    ).toThrow();
    expect(() => assertConsumer(delegated, state, now)).toThrow();
    expect(() =>
      assertConsumer(
        delegated,
        { ...delegatedState, grant: { ...delegatedState.grant!, tokenId: "other" } },
        now,
      ),
    ).toThrow();
  });
  it("token não dispensa aprovação exigida pelo pacote", () => {
    expect(
      authorizePublication(identity, state, { ...publication, approval: "human" }, now)
        .requireHumanApproval,
    ).toBe(true);
    const stronger = {
      ...state,
      token: {
        ...state.token,
        permissions: {
          ...permissions,
          skills: [{ ...permissions.skills[0]!, requireHumanApproval: true }],
        },
      },
    };
    expect(authorizePublication(identity, stronger, publication, now).requireHumanApproval).toBe(
      true,
    );
  });
  it("nega chamada administrativa direta e delegação superior", () => {
    expect(() => assertAdministrativePermission(identity, state, "publicar", now)).toThrow();
    const higher = { ...permissions, administrative: ["publicar"] as const };
    expect(permissionsContainedBy(higher, permissions)).toBe(false);
    expect(() => assertDelegation(higher, higher, state.token)).toThrow();
    expect(() => assertDelegation(permissions, permissions, state.token)).not.toThrow();
  });
  it("aprovação adicional é restrição também na delegação", () => {
    const ceiling = {
      ...permissions,
      skills: [{ ...permissions.skills[0]!, requireHumanApproval: true }],
    };
    expect(permissionsContainedBy(permissions, ceiling)).toBe(false);
  });
  it("fonte só é inferida quando inequívoca", () => {
    expect(resolveSource(publication)).toBe("source");
    expect(() => resolveSource({ ...publication, sourceIds: ["a", "b"] })).toThrow();
    expect(() => resolveSource(publication, "other")).toThrow();
  });
  it("delegação não remove nem aumenta limites de cruzamento", () => {
    const ceiling = { ...permissions, federationLimits: { rowsPerSource: 100, timeoutMs: 1000 } };
    expect(permissionsContainedBy(permissions, ceiling)).toBe(false);
    expect(
      permissionsContainedBy(
        { ...permissions, federationLimits: { rowsPerSource: 101, timeoutMs: 1000 } },
        ceiling,
      ),
    ).toBe(false);
    expect(
      permissionsContainedBy(
        { ...permissions, federationLimits: { rowsPerSource: 50, timeoutMs: 500 } },
        ceiling,
      ),
    ).toBe(true);
    expect(permissionsContainedBy({ ...permissions, skills: [] }, ceiling)).toBe(true);
    const issuer = { ...state.token, permissions: ceiling, delegation: ceiling };
    expect(() => assertDelegation(permissions, permissions, issuer)).toThrow();
  });
});
