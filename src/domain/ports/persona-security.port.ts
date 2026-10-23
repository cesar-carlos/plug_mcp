import type { AdministrativePermission, ConsumerIdentity } from "../persona-v2/model.js";
import type { PersonaTransaction } from "./persona-v2.port.js";
import type { TokenIssuance } from "../persona-v2/token-issuance.js";
import type {
  IntegrationCredential,
  IntegrationReference,
  IntegrationRegistration,
} from "../persona-v2/integration-credential.js";
export interface OwnerDelegation {
  administrative: readonly AdministrativePermission[];
  personaId: string;
  ownerId: string;
  hubId: string;
  credentialEnc: string;
  expiresAt: Date;
  version: number;
  revokedAt: Date | null;
}
export interface OwnerDelegationHubPort {
  create(
    jwt: string,
    input: {
      audience: string;
      personaId: string;
      administrative: readonly AdministrativePermission[];
    },
  ): Promise<{
    id: string;
    clientId: string;
    audience: string;
    personaId: string;
    expiresAt: string;
    credential: string;
    administrative: readonly AdministrativePermission[];
  }>;
  verify(
    credential: string,
    input: { audience: string; personaId: string },
  ): Promise<{
    id: string;
    clientId: string;
    audience: string;
    personaId: string;
    expiresAt: string;
    active: true;
    administrative: readonly AdministrativePermission[];
  }>;
  revoke(jwt: string, id: string): Promise<void>;
}
export interface PersonaSetup {
  hash: string;
  identity: ConsumerIdentity;
  delegationVersion: number;
  purpose:
    | "source_create"
    | "source_rotate"
    | "token_rotate"
    | "token_issue"
    | "integration_create"
    | "integration_rotate";
  integration?: IntegrationReference;
  issuance?: TokenIssuance;
  sourceId?: string;
  sourceVersion?: number;
  csrfHash: string;
  expiresAt: Date;
  consumedAt: Date | null;
}
export interface PersonaSecurityTransaction {
  integration(personaId: string, id: string): Promise<IntegrationReference | null>;
  saveIntegration(input: {
    personaId: string;
    id: string;
    expectedVersion: number;
    registration: IntegrationRegistration;
    credential: IntegrationCredential;
  }): Promise<void>;
  delegation(personaId: string): Promise<OwnerDelegation | null>;
  saveDelegation(value: OwnerDelegation, expectedVersion: number): Promise<void>;
  setup(hash: string): Promise<PersonaSetup | null>;
  createSetup(value: PersonaSetup): Promise<void>;
  consumeSetup(hash: string, now: Date): Promise<void>;
}
export interface PersonaBrowserCommitGuard {
  beforeWrite(): Promise<void>;
  commit(tx: PersonaTransaction): Promise<void>;
  finish(tx: PersonaTransaction): Promise<void>;
}
