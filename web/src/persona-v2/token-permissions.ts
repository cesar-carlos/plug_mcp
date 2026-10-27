import type { FederationBudget } from "../../../src/domain/persona-v2/federation";
import type { OperationLimits, QueryLimits } from "../../../src/domain/persona-v2/execution-limits";
import type { GrantPublication } from "./model";
import { publicationExternalOperations, publicationGrant } from "./publication-grant";

export interface PermissionLimits {
  queryLimits?: Partial<QueryLimits>;
  operationLimits?: Partial<OperationLimits>;
  federationLimits?: Partial<FederationBudget>;
}

export interface TokenPermissions extends PermissionLimits {
  sourceIds: string[];
  skills: Array<
    PermissionLimits & {
      skillId: string;
      capabilities: string[];
      effects: ("select" | "insert" | "update" | "delete")[];
      requireHumanApproval: boolean;
    }
  >;
  externalOperationIds: string[];
  administrative: string[];
  managedIntegrationIds?: string[];
}

export interface UncertainIssuance {
  checked: boolean;
  tokens: { id: string; name: string; revokedAt: string | null }[];
}

export interface ManagedToken {
  id: string;
  name: string;
  expiresAt: string | null;
  revokedAt: string | null;
  authorizationVersion: number;
  permissions: TokenPermissions;
  delegation: TokenPermissions;
}

export function applyTokenSkillGrant(
  permissions: TokenPermissions,
  skillId: string,
  checked: boolean,
  publication: GrantPublication | undefined,
): TokenPermissions {
  if (!checked) {
    return {
      ...permissions,
      skills: permissions.skills.filter((grant) => grant.skillId !== skillId),
    };
  }
  if (!publication) {
    throw new Error("Publicação indisponível; atualize a lista.");
  }
  const added = publicationGrant(skillId, publication);
  return {
    ...permissions,
    skills: [...permissions.skills.filter((grant) => grant.skillId !== skillId), added],
    externalOperationIds: [
      ...new Set([
        ...permissions.externalOperationIds,
        ...publicationExternalOperations(publication),
      ]),
    ],
  };
}

export function emptyTokenPermissions(): TokenPermissions {
  return { sourceIds: [], skills: [], externalOperationIds: [], administrative: [] };
}

export function selectTokenSkill(
  selected: readonly string[],
  skillLimits: Readonly<Record<string, PermissionLimits>>,
  id: string,
  checked: boolean,
): { selected: string[]; skillLimits: Record<string, PermissionLimits> } {
  const nextSelected = selected.filter((skillId) => skillId !== id);
  const nextLimits = { ...skillLimits };
  if (checked) {
    nextLimits[id] = {};
    nextSelected.push(id);
  } else {
    delete nextLimits[id];
  }
  return { selected: nextSelected, skillLimits: nextLimits };
}

export function buildNewTokenPermissions(input: {
  selectedSkillIds: readonly string[];
  publications: Readonly<Record<string, GrantPublication | undefined>>;
  limits: PermissionLimits;
  skillLimits: Readonly<Record<string, PermissionLimits | undefined>>;
  administrative: readonly string[];
  administrativeSources: readonly string[];
  managedIntegrations: readonly string[];
}): TokenPermissions {
  const chosen = input.selectedSkillIds.flatMap((id) => {
    const publication = input.publications[id];
    return publication ? [{ id, publication }] : [];
  });
  return {
    ...emptyTokenPermissions(),
    ...input.limits,
    administrative: [...input.administrative],
    managedIntegrationIds: input.administrative.includes("gerenciar_integracoes")
      ? [...input.managedIntegrations]
      : [],
    externalOperationIds: [
      ...new Set(chosen.flatMap((item) => publicationExternalOperations(item.publication))),
    ],
    sourceIds: [
      ...new Set([
        ...input.administrativeSources,
        ...chosen.flatMap((item) =>
          item.publication.package.sourceId
            ? [item.publication.package.sourceId]
            : (item.publication.package.dependencies ?? []).map(
                (dependency) => dependency.sourceId,
              ),
        ),
      ]),
    ],
    skills: chosen.map((item) => ({
      ...input.skillLimits[item.id],
      ...publicationGrant(item.id, item.publication),
    })),
  };
}
