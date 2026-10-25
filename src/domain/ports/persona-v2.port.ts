import type { CryptoPort } from "./crypto.port.js";
import type { PhysicalQueryFence } from "./persona-query-reuse.port.js";
import type { PersonaExternalTransaction } from "./persona-external.port.js";
import type { PersonaSecurityTransaction } from "./persona-security.port.js";
import type {
  AuthorizationSnapshot,
  ConsumerIdentity,
  Owner,
  Persona,
  PersonaToken,
  ManagedPersonaToken,
  Source,
  SourcePublicationImpact,
} from "../persona-v2/model.js";
import type { StoredPersonaIcon } from "../persona-v2/persona-icon.js";
import type { OperationReceipt, SqlOperationCommand } from "../persona-v2/operation.js";
import type { PersonaCatalogTransaction } from "../persona-v2/catalog.js";
import type { HistoryFilter, HistoryPage } from "../persona-v2/console.js";
import type {
  SchemaInspection,
  StoredStructureEvidence,
  StructureEvidenceRecord,
} from "../persona-v2/source-schema.js";
import type { SharedKnowledgeTransaction } from "../persona-v2/shared-knowledge.js";
import type { PhysicalProfileTransaction } from "../persona-v2/physical-profile.js";
import type { PublicationKnowledgeIndexPort } from "./publication-knowledge.port.js";
import type { PhysicalCurationTransaction } from "../persona-v2/physical-curation.js";
import type { KnowledgeMaintenancePort } from "../persona-v2/knowledge-maintenance.js";
import type { PersonaNotificationTransaction } from "../persona-v2/notifications.js";
import type { PersonaOAuthConnectionTransaction } from "../persona-v2/oauth-connections.js";

export interface HubOwnerProfile {
  readonly clientId: string;
  readonly active: boolean;
}

export interface OwnerAuthenticationPort {
  readonly hubOrigin: string;
  login(email: string, password: string): Promise<{ accessToken: string }>;
  profile(accessToken: string): Promise<HubOwnerProfile>;
}

export interface AdministrativeSession {
  readonly owner: Owner;
  readonly accessToken: string;
  readonly expiresAt: Date;
}

export interface AdministrativeSessionPort {
  create(session: AdministrativeSession): string;
  find(opaqueId: string, now: Date): AdministrativeSession | null;
  remove(opaqueId: string): void;
}

export interface PersonaTransaction {
  readonly oauthConnections?: PersonaOAuthConnectionTransaction;
  readonly notifications?: PersonaNotificationTransaction;
  readonly external?: PersonaExternalTransaction;
  readonly knowledgeMaintenance?: KnowledgeMaintenancePort;
  readonly physicalCuration?: PhysicalCurationTransaction;
  readonly knowledgeIndex: PublicationKnowledgeIndexPort;
  readonly profiles?: PhysicalProfileTransaction;
  readonly knowledge?: SharedKnowledgeTransaction;
  structureEvidence(personaId: string, id: string): Promise<StructureEvidenceRecord | null>;
  recordStructureEvidence(input: {
    id: string;
    source: Source;
    scope: SchemaInspection;
    evidence: StoredStructureEvidence;
    hash: string;
    expiresAt: Date;
  }): Promise<void>;
  readonly security: PersonaSecurityTransaction;
  setAdministrativeActor(ownerId: string): Promise<void>;
  setAdministrativeConsumer(identity: ConsumerIdentity): Promise<void>;
  history(personaId: string, filter: HistoryFilter): Promise<HistoryPage>;
  lastCompletedQuery(personaId: string): Promise<string | null>;
  lastConsumerConnection(personaId: string): Promise<string | null>;
  recordConsumerConnection(identity: ConsumerIdentity): Promise<void>;
  readonly catalog: PersonaCatalogTransaction;
  recordFederation(input: {
    personaId: string;
    tokenId: string;
    skillId: string;
    publicationId: string;
    validation: boolean;
    durationMs: number;
    rows: number;
    steps: number;
  }): Promise<void>;
  recordQuery(input: {
    reuseKind?: "fresh" | "cache" | "singleflight";
    personaId: string;
    tokenId: string;
    sourceId: string;
    publicationId: string;
    skillId: string;
    validation: boolean;
    durationMs: number;
    rows: number;
  }): Promise<void>;
  recordAttachment?(input: {
    personaId: string;
    tokenId: string;
    sourceId: string;
    skillId: string;
    publicationId: string;
    id: string;
    event: "created" | "downloaded";
    bytes: number;
    rows: number;
    durationMs: number;
  }): Promise<void>;
  authorization(identity: ConsumerIdentity): Promise<AuthorizationSnapshot | null>;
  owner(hubOrigin: string, hubClientId: string): Promise<Owner>;
  findPersona(id: string): Promise<Persona | null>;
  readPersonaIcon(personaId: string): Promise<StoredPersonaIcon | null>;
  savePersonaIcon(personaId: string, bytes: Uint8Array, expectedRevision: number): Promise<number>;
  clearPersonaIcon(personaId: string, expectedRevision: number): Promise<void>;
  createPersona(persona: Persona): Promise<void>;
  updatePersona(persona: Persona, expectedVersion: number): Promise<void>;
  changePersonaState(persona: Persona, expectedVersion: number, now: Date): Promise<void>;
  listPersonas(ownerId: string): Promise<readonly Persona[]>;
  physicalSource(identityHash: string): Promise<string>;
  queryCacheFence?(source: Source): Promise<PhysicalQueryFence>;
  listSources(personaId: string): Promise<readonly Source[]>;
  sourcePublicationImpact(personaId: string, sourceId: string): Promise<SourcePublicationImpact>;
  publicationImpact(personaId: string, publicationId: string): Promise<SourcePublicationImpact>;
  addSource(
    source: Source,
    credentials: {
      emailEnc: string;
      passwordEnc: string;
      clientTokenEnc: string;
    },
  ): Promise<void>;
  updateSource(
    source: Source,
    expectedVersion: number,
    credentials?: { emailEnc: string; passwordEnc: string; clientTokenEnc: string },
  ): Promise<void>;
  changeSourceState(
    source: Source,
    expectedVersion: number,
    credentials?: { emailEnc: string; passwordEnc: string; clientTokenEnc: string },
  ): Promise<void>;
  replaceSource(source: Source, replacementId: string, expectedVersion: number): Promise<void>;
  issueToken(token: PersonaToken, name: string): Promise<void>;
  listTokens(personaId: string): Promise<readonly ManagedPersonaToken[]>;
  changeToken(
    token: ManagedPersonaToken,
    expectedVersion: number,
    tokenHash?: string,
  ): Promise<void>;
  revokeToken(personaId: string, tokenId: string, now: Date): Promise<void>;
}

export interface PersonaRepositoryPort {
  transaction<T>(
    locks: { readonly personaIds: readonly string[]; readonly tokenIds: readonly string[] },
    action: (transaction: PersonaTransaction) => Promise<T>,
    beforeCommit?: () => Promise<void>,
  ): Promise<T>;
  authentication(tokenHash: string): Promise<AuthorizationSnapshot | null>;
  authorization(identity: ConsumerIdentity): Promise<AuthorizationSnapshot | null>;
  readPersonaIcon(personaId: string): Promise<StoredPersonaIcon | null>;
}

/** Write dispatch has no retry method. Status/reconciliation is a separate operation. */
export interface SqlOperationGatewayPort {
  verifyCapabilitiesAndPolicy(source: Source, command: SqlOperationCommand): Promise<void>;
  execute(source: Source, command: SqlOperationCommand): Promise<OperationReceipt>;
  get(source: Source, operationId: string, fingerprint: string): Promise<OperationReceipt | null>;
  cancel(source: Source, operationId: string, fingerprint: string): Promise<void>;
}

export interface PersonaServices {
  readonly repository: PersonaRepositoryPort;
  readonly ownerAuth: OwnerAuthenticationPort;
  readonly sessions: AdministrativeSessionPort;
  readonly crypto: CryptoPort;
  readonly now: () => Date;
  readonly sourceVerifier?: SourceVerificationPort;
}

export interface VerifiedSource {
  readonly database: string;
  readonly dialect: Source["dialect"];
  readonly identityHash: string;
  readonly verifiedAt: string;
}

export interface SourceVerificationPort {
  verify(input: {
    readonly dialect: Source["dialect"];
    readonly agentId: string;
    readonly database?: string;
    readonly email: string;
    readonly password: string;
    readonly clientToken: string;
  }): Promise<VerifiedSource>;
}
