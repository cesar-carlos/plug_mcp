import { expect, it } from "vitest";
import { currentOAuthProfile } from "../../../src/domain/persona-v2/oauth-profile-context.js";
import { assertConsumer } from "../../../src/domain/persona-v2/authorization.js";
import type {
  AuthorizationSnapshot,
  ConsumerIdentity,
} from "../../../src/domain/persona-v2/model.js";

const permissions = { sourceIds: [], skills: [], externalOperationIds: [], administrative: [] };
const identity: ConsumerIdentity = {
  personaId: "persona",
  tokenId: "token",
  personaVersion: 2,
  tokenVersion: 1,
  grant: { id: "grant", expiresAt: 10000 },
};
const state: AuthorizationSnapshot = {
  persona: {
    id: "persona",
    ownerId: "owner",
    name: "Fixture",
    specialty: "",
    instructions: "",
    active: true,
    authorizationVersion: 3,
    oauthVersionFloor: 2,
  },
  token: {
    id: "token",
    personaId: "persona",
    tokenHash: "fixture",
    expiresAt: null,
    revokedAt: null,
    authorizationVersion: 1,
    permissions,
    delegation: permissions,
  },
  sources: [],
  grant: {
    id: "grant",
    personaId: "persona",
    tokenId: "token",
    tokenVersion: 1,
    permissions,
    expiresAt: new Date(10000),
    revokedAt: null,
  },
};

it("atualiza apenas revisão editorial e conserva a verificação exata em voo", () => {
  const fresh = currentOAuthProfile(identity, state);
  expect(fresh).toEqual({ ...identity, personaVersion: 3 });
  expect(() => assertConsumer(fresh, state, new Date(0))).not.toThrow();
  expect(() => assertConsumer(identity, state, new Date(0))).toThrow();
  expect(identity.personaVersion).toBe(2);
});

it.each([undefined, 0, 3, 4, 1.5])(
  "barreira %s ausente/incompatível não recupera contexto",
  (floor) => {
    const { oauthVersionFloor: _floor, ...persona } = state.persona;
    const current = {
      ...state,
      persona: { ...persona, ...(floor === undefined ? {} : { oauthVersionFloor: floor }) },
    };
    expect(currentOAuthProfile(identity, current)).toBe(identity);
  },
);

it("não normaliza outra persona, versão futura ou identidade sem concessão", () => {
  for (const actor of [
    { ...identity, personaId: "other" },
    { ...identity, personaVersion: 4 },
    {
      personaId: identity.personaId,
      tokenId: identity.tokenId,
      tokenVersion: 1,
      personaVersion: 2,
    },
  ]) {
    expect(currentOAuthProfile(actor, state)).toBe(actor);
  }
});

it("normalizar perfil não contorna mudança do token, revogação ou prazo do access", () => {
  const fresh = currentOAuthProfile(identity, state);
  expect(() =>
    assertConsumer(
      fresh,
      { ...state, token: { ...state.token, authorizationVersion: 2 } },
      new Date(0),
    ),
  ).toThrow();
  expect(() =>
    assertConsumer(
      fresh,
      { ...state, token: { ...state.token, revokedAt: new Date(0) } },
      new Date(0),
    ),
  ).toThrow();
  expect(() => assertConsumer(fresh, state, new Date(10000))).toThrow();
});
