import { describe, it, expect } from "vitest";
import { assertTokenIssuance } from "../../../src/domain/persona-v2/token-issuance.js";
import type { AuthorizationSnapshot, Permissions } from "../../../src/domain/persona-v2/model.js";
import type { OwnerDelegation } from "../../../src/domain/ports/persona-security.port.js";

const now = new Date("2026-10-15T12:00:00Z"),
  deadline = new Date(now.getTime() + 600000);
const identity = { personaId: "persona", personaVersion: 1, tokenId: "token", tokenVersion: 1 };
const grants: Permissions = {
  sourceIds: ["source"],
  externalOperationIds: [],
  administrative: ["gerenciar_tokens"],
  queryLimits: { maxRows: 100 },
  skills: [
    {
      skillId: "skill",
      capabilities: ["table:orders", "field-use:source:orders.id:filtro"],
      effects: ["select"],
      requireHumanApproval: true,
    },
  ],
};
const state: AuthorizationSnapshot = {
  persona: {
    id: "persona",
    ownerId: "owner",
    name: "Fixture",
    specialty: "Fixture",
    instructions: "",
    active: true,
    authorizationVersion: 1,
  },
  token: {
    id: "token",
    personaId: "persona",
    tokenHash: "hash",
    expiresAt: deadline,
    revokedAt: null,
    authorizationVersion: 1,
    permissions: grants,
    delegation: grants,
  },
  sources: [],
};
const owner: OwnerDelegation = {
  personaId: "persona",
  ownerId: "owner",
  hubId: "hub",
  credentialEnc: "ciphertext",
  administrative: ["gerenciar_tokens"],
  expiresAt: deadline,
  version: 1,
  revokedAt: null,
};
const empty = { sourceIds: [], skills: [], externalOperationIds: [], administrative: [] };
const proposal = {
  name: "Limitado",
  expiresAt: deadline.toISOString(),
  permissions: {
    ...grants,
    skills: [...grants.skills].map((s) => ({
      ...s,
      capabilities: [...s.capabilities],
      effects: [...s.effects],
    })),
    administrative: [],
    sourceIds: [...grants.sourceIds],
    externalOperationIds: [],
  },
  delegation: empty,
};

describe("concessões limitadas de emissão", () => {
  it("permite redução conservando classificação por uso e aprovação", () => {
    expect(() => assertTokenIssuance(proposal, state, identity, owner, now)).not.toThrow();
  });
  it.each(["campo", "escrita", "aprovação", "limite"])("recusa ampliação de %s", (kind) => {
    const p = structuredClone(proposal);
    if (kind === "campo") {
      p.permissions.skills[0]!.capabilities.push("field-use:source:orders.id:projecao");
    }
    if (kind === "escrita") {
      p.permissions.skills[0]!.effects.push("delete");
    }
    if (kind === "aprovação") {
      p.permissions.skills[0]!.requireHumanApproval = false;
    }
    if (kind === "limite") {
      p.permissions.queryLimits = { maxRows: 101 };
    }
    expect(() => assertTokenIssuance(p, state, identity, owner, now)).toThrow();
  });
  it("aplica teto menor de OAuth e prazo do access sem herdar permissões omitidas", () => {
    expect(() =>
      assertTokenIssuance(
        proposal,
        state,
        { ...identity, grant: { id: "grant", expiresAt: now.getTime() + 1000 } },
        owner,
        now,
      ),
    ).toThrow();
    expect(() =>
      assertTokenIssuance(
        proposal,
        {
          ...state,
          grant: {
            id: "grant",
            personaId: "persona",
            tokenId: "token",
            tokenVersion: 1,
            permissions: empty,
            expiresAt: deadline,
            revokedAt: null,
          },
        },
        identity,
        owner,
        now,
      ),
    ).toThrow();
  });
});
