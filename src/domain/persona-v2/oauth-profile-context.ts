import type { AuthorizationSnapshot, ConsumerIdentity } from "./model.js";

/** Refresh editorial context at the OAuth boundary, never during an operation. */
export function currentOAuthProfile(
  identity: ConsumerIdentity,
  state: AuthorizationSnapshot,
): ConsumerIdentity {
  const current = state.persona.authorizationVersion;
  const floor = state.persona.oauthVersionFloor ?? current;
  if (
    identity.grant &&
    identity.personaId === state.persona.id &&
    Number.isInteger(floor) &&
    floor > 0 &&
    floor <= current &&
    identity.personaVersion >= floor &&
    identity.personaVersion <= current
  ) {
    return { ...identity, personaVersion: current };
  }
  return identity;
}
