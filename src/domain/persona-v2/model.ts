import type { Dialeto } from "../entities/dialeto.js";
import type { FederationBudget } from "./federation.js";
import type { QueryLimits, OperationLimits } from "./execution-limits.js";

export const PERSONA_SCHEMA_GENERATION = "persona-v2";
export const PREPARATION_TTL_MS = 15 * 60 * 1000;

export type SkillKind = "consulta" | "cruzamento" | "operacao_sql" | "acao_externa";
/** Metadata only: the affected closure includes historical and transitive publications. */
export interface SourcePublicationImpact {
  readonly total: number;
  readonly publications: readonly {
    readonly publicationId: string;
    readonly skillId: string;
    readonly name: string;
    readonly revision: number;
    readonly kind: SkillKind;
    readonly direct: boolean;
    readonly active: boolean;
    readonly suspended: boolean;
  }[];
}
export type SqlEffect = "select" | "insert" | "update" | "delete";
export type AdministrativePermission =
  "treinar" | "publicar" | "gerenciar_fontes" | "gerenciar_tokens" | "gerenciar_integracoes";

export interface Owner {
  readonly id: string;
  readonly hubOrigin: string;
  readonly hubClientId: string;
}

export interface Persona {
  readonly id: string;
  readonly ownerId: string;
  readonly name: string;
  readonly specialty: string;
  readonly instructions: string;
  readonly active: boolean;
  readonly authorizationVersion: number;
}

export interface Source {
  /** A replaced binding is historical and can never be recovered or rebound. */
  readonly replacedBySourceId?: string | null;
  readonly identityHash?: string;
  readonly identityVerifiedAt?: string;
  readonly id: string;
  readonly personaId: string;
  readonly physicalSourceId: string;
  readonly name: string;
  readonly purpose: string;
  readonly environment: string;
  readonly agentId: string;
  readonly database: string;
  readonly dialect: Exclude<Dialeto, "firebird">;
  readonly credentialId: string;
  readonly credentialVersion: number;
  readonly rowRestrictions?: readonly unknown[];
  readonly authorizationVersion: number;
  readonly active: boolean;
}

/** Atomic capabilities are frozen in each grant. Publishing adds no grant. */
export interface SkillGrant {
  readonly queryLimits?: Partial<QueryLimits>;
  readonly operationLimits?: Partial<OperationLimits>;
  readonly federationLimits?: Partial<FederationBudget>;
  readonly skillId: string;
  readonly capabilities: readonly string[];
  readonly effects: readonly SqlEffect[];
  readonly requireHumanApproval: boolean;
}

export interface Permissions {
  /** Explicit administrative scope; absent on older tokens means no integration management. */
  readonly managedIntegrationIds?: readonly string[];
  readonly queryLimits?: Partial<QueryLimits>;
  readonly operationLimits?: Partial<OperationLimits>;
  readonly federationLimits?: Partial<FederationBudget>;
  readonly sourceIds: readonly string[];
  readonly skills: readonly SkillGrant[];
  readonly externalOperationIds: readonly string[];
  readonly administrative: readonly AdministrativePermission[];
}

export interface PersonaToken {
  readonly id: string;
  readonly personaId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date | null;
  readonly revokedAt: Date | null;
  readonly authorizationVersion: number;
  readonly permissions: Permissions;
  readonly delegation: Permissions;
}

export interface ManagedPersonaToken extends Omit<PersonaToken, "tokenHash"> {
  readonly name: string;
}

export interface ConsumerIdentity {
  readonly personaId: string;
  readonly tokenId: string;
  readonly tokenVersion: number;
  readonly personaVersion: number;
  readonly grant?: {
    readonly id: string;
    /** Access-token deadline, rechecked inside every authorized transaction. */
    readonly expiresAt?: number;
  };
}

export interface PersonaOAuthGrant {
  readonly id: string;
  readonly personaId: string;
  readonly tokenId: string;
  readonly tokenVersion: number;
  readonly permissions: Permissions;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
}

export interface PublicationAuthority {
  readonly id: string;
  readonly personaId: string;
  readonly skillId: string;
  readonly kind: SkillKind;
  readonly sourceIds: readonly string[];
  readonly externalOperationIds: readonly string[];
  readonly requiredCapabilities: readonly string[];
  readonly effects: readonly SqlEffect[];
  readonly hash: string;
  readonly suspendedAt: Date | null;
  readonly approval: "human" | "automatic";
}

export interface AuthorizationSnapshot {
  readonly persona: Persona;
  readonly token: PersonaToken;
  readonly sources: readonly Source[];
  readonly grant?: PersonaOAuthGrant;
}

export class PersonaV2Error extends Error {
  readonly authorizationReason?:
    | "token_expired"
    | "token_revoked"
    | "authorization_changed"
    | "access_expired"
    | "grant_expired"
    | "grant_revoked"
    | "identity_invalid";
  readonly source?: "mcp" | "client_agent_access" | "client_token_rpc";
  readonly hint?: string;
  constructor(
    readonly code:
      | "ADMIN_SESSION_EXPIRED"
      | "AUTHORIZATION_DENIED"
      | "ATTACHMENT_UNAVAILABLE"
      | "STALE_AUTHORIZATION"
      | "SOURCE_AMBIGUOUS"
      | "INVALID_PLAN"
      | "BUDGET_EXCEEDED"
      | "INCOMPLETE_INPUT"
      | "OPERATION_CONFLICT"
      | "OPERATION_EXPIRED"
      | "APPROVAL_REQUIRED"
      | "CAPABILITY_UNAVAILABLE",
    message: string,
    context?: {
      source?: "mcp" | "client_agent_access" | "client_token_rpc";
      hint?: string;
      authorizationReason?: PersonaV2Error["authorizationReason"];
    },
  ) {
    super(message);
    this.name = "PersonaV2Error";
    this.source = context?.source;
    this.hint = context?.hint;
    this.authorizationReason = context?.authorizationReason;
  }
}
