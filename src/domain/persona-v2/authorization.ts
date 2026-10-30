import {
  PersonaV2Error,
  type AdministrativePermission,
  type AuthorizationSnapshot,
  type ConsumerIdentity,
  type Permissions,
  type PublicationAuthority,
} from "./model.js";
import { DEFAULT_FEDERATION_BUDGET } from "./federation.js";
import { queryLimits, operationLimits } from "./execution-limits.js";

const containsAll = <T>(allowed: readonly T[], requested: readonly T[]): boolean =>
  requested.every((item) => allowed.includes(item));

export const permissionsContainedBy = (requested: Permissions, ceiling: Permissions): boolean =>
  containsAll(ceiling.managedIntegrationIds ?? [], requested.managedIntegrationIds ?? []) &&
  containsAll(ceiling.sourceIds, requested.sourceIds) &&
  containsAll(ceiling.externalOperationIds, requested.externalOperationIds) &&
  containsAll(ceiling.administrative, requested.administrative) &&
  requested.skills.every((grant) => {
    const upper = ceiling.skills.find((candidate) => candidate.skillId === grant.skillId);
    return (
      upper !== undefined &&
      containsAll(upper.capabilities, grant.capabilities) &&
      containsAll(upper.effects, grant.effects) &&
      (!upper.requireHumanApproval || grant.requireHumanApproval) &&
      containedLimits(
        queryLimits(requested.queryLimits ?? {}, grant.queryLimits ?? {}),
        queryLimits(ceiling.queryLimits ?? {}, upper.queryLimits ?? {}),
      ) &&
      containedLimits(
        operationLimits(requested.operationLimits ?? {}, grant.operationLimits ?? {}),
        operationLimits(ceiling.operationLimits ?? {}, upper.operationLimits ?? {}),
      ) &&
      (Object.keys(DEFAULT_FEDERATION_BUDGET) as (keyof typeof DEFAULT_FEDERATION_BUDGET)[]).every(
        (field) =>
          Math.min(
            requested.federationLimits?.[field] ?? DEFAULT_FEDERATION_BUDGET[field],
            grant.federationLimits?.[field] ?? DEFAULT_FEDERATION_BUDGET[field],
          ) <=
          Math.min(
            ceiling.federationLimits?.[field] ?? DEFAULT_FEDERATION_BUDGET[field],
            upper.federationLimits?.[field] ?? DEFAULT_FEDERATION_BUDGET[field],
          ),
      )
    );
  });

const containedLimits = <T extends object>(requested: T, ceiling: T): boolean =>
  (Object.keys(requested) as (keyof T)[]).every((key) => requested[key] <= ceiling[key]);

export const assertDelegation = (
  requested: Permissions,
  requestedDelegation: Permissions,
  issuer: AuthorizationSnapshot["token"],
): void => {
  if (
    !issuer.permissions.administrative.includes("gerenciar_tokens") ||
    !permissionsContainedBy(requested, issuer.permissions) ||
    !permissionsContainedBy(requested, issuer.delegation) ||
    !permissionsContainedBy(requestedDelegation, requested) ||
    !permissionsContainedBy(requestedDelegation, issuer.delegation)
  ) {
    throw new PersonaV2Error("AUTHORIZATION_DENIED", "Concessão excede os limites de delegação.");
  }
};

export const assertConsumer = (
  identity: ConsumerIdentity,
  state: AuthorizationSnapshot,
  now: Date,
): readonly Permissions[] => {
  const { persona, token } = state;
  if (
    !persona.active ||
    token.revokedAt !== null ||
    (token.expiresAt !== null && token.expiresAt <= now) ||
    persona.id !== identity.personaId ||
    token.personaId !== persona.id ||
    token.id !== identity.tokenId
  ) {
    throw new PersonaV2Error("AUTHORIZATION_DENIED", "Consumidor sem autorização vigente.", {
      authorizationReason:
        token.revokedAt !== null
          ? "token_revoked"
          : token.expiresAt !== null && token.expiresAt <= now
            ? "token_expired"
            : "identity_invalid",
    });
  }
  if (
    token.authorizationVersion !== identity.tokenVersion ||
    persona.authorizationVersion !== identity.personaVersion
  ) {
    throw new PersonaV2Error("STALE_AUTHORIZATION", "A autorização mudou; renove o contexto.", {
      authorizationReason: "authorization_changed",
    });
  }
  if (!identity.grant) {
    return [token.permissions];
  }
  const grant = state.grant;
  if (
    grant?.id !== identity.grant.id ||
    (identity.grant.expiresAt !== undefined && identity.grant.expiresAt <= now.getTime()) ||
    grant.personaId !== persona.id ||
    grant.tokenId !== token.id ||
    grant.revokedAt !== null ||
    grant.expiresAt <= now ||
    grant.tokenVersion !== token.authorizationVersion
  ) {
    throw new PersonaV2Error("AUTHORIZATION_DENIED", "Concessão OAuth inválida ou revogada.", {
      authorizationReason: grant?.revokedAt
        ? "grant_revoked"
        : grant && grant.expiresAt <= now
          ? "grant_expired"
          : identity.grant.expiresAt !== undefined && identity.grant.expiresAt <= now.getTime()
            ? "access_expired"
            : "identity_invalid",
    });
  }
  return [token.permissions, grant.permissions];
};

export const assertAdministrativePermission = (
  identity: ConsumerIdentity,
  state: AuthorizationSnapshot,
  permission: AdministrativePermission,
  now: Date,
): void => {
  if (!assertConsumer(identity, state, now).every((p) => p.administrative.includes(permission))) {
    throw new PersonaV2Error("AUTHORIZATION_DENIED", "Permissão administrativa ausente.");
  }
};

/** Same gate is used for discovery, resources, planning, execution and delivery. */
export const authorizePublication = (
  identity: ConsumerIdentity,
  state: AuthorizationSnapshot,
  publication: PublicationAuthority,
  now: Date,
): { requireHumanApproval: boolean } => {
  const permissions = assertConsumer(identity, state, now);
  if (publication.personaId !== state.persona.id || publication.suspendedAt !== null) {
    throw new PersonaV2Error("AUTHORIZATION_DENIED", "Publicação indisponível nesta persona.");
  }
  for (const sourceId of publication.sourceIds) {
    const source = state.sources.find((s) => s.id === sourceId);
    if (!source?.active || source.personaId !== state.persona.id) {
      throw new PersonaV2Error("AUTHORIZATION_DENIED", "Fonte indisponível nesta persona.");
    }
  }
  let requireHumanApproval = publication.approval === "human";
  for (const permission of permissions) {
    const grant = permission.skills.find((g) => g.skillId === publication.skillId);
    if (
      !grant ||
      !containsAll(permission.sourceIds, publication.sourceIds) ||
      !containsAll(permission.externalOperationIds, publication.externalOperationIds) ||
      !containsAll(grant.capabilities, publication.requiredCapabilities) ||
      !containsAll(grant.effects, publication.effects)
    ) {
      throw new PersonaV2Error("AUTHORIZATION_DENIED", "Publicação excede a concessão explícita.");
    }
    requireHumanApproval ||= grant.requireHumanApproval;
  }
  return { requireHumanApproval };
};

export const resolveSource = (publication: PublicationAuthority, requested?: string): string => {
  if (requested !== undefined && publication.sourceIds.includes(requested)) {
    return requested;
  }
  if (requested === undefined && publication.sourceIds.length === 1) {
    return publication.sourceIds[0]!;
  }
  throw new PersonaV2Error("SOURCE_AMBIGUOUS", "Informe uma fonte autorizada pela skill.");
};
