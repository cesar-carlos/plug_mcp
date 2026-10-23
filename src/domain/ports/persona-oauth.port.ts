import type {
  AuthorizationSnapshot,
  ConsumerIdentity,
  Permissions,
  PersonaOAuthGrant,
} from "../persona-v2/model.js";

export interface PersonaOAuthBinding {
  clientId: string;
  redirectUri: string;
  resource: string;
  challenge: string;
}
export interface PersonaOAuthRecord {
  /** Only the hash of the opaque browser/code/token identifier is persisted. */
  hash: string;
  kind: "transaction" | "code" | "access_token" | "refresh_token";
  expiresAt: number;
  consumedAt?: number;
  binding: PersonaOAuthBinding;
  identity?: ConsumerIdentity;
  permissions?: Permissions;
  state?: string;
  nonceHash?: string;
  csrfHash?: string;
}
export interface PersonaOAuthUnit {
  record(hash: string): Promise<PersonaOAuthRecord | null>;
  put(record: PersonaOAuthRecord): Promise<void>;
  authorization(identity: ConsumerIdentity): Promise<AuthorizationSnapshot | null>;
  grant(grant: PersonaOAuthGrant, clientId: string): Promise<void>;
  revoke(identity: ConsumerIdentity, now: Date): Promise<void>;
}
export interface PersonaOAuthStore {
  record(hash: string): Promise<PersonaOAuthRecord | null>;
  transaction<T>(
    identity: ConsumerIdentity | undefined,
    action: (unit: PersonaOAuthUnit) => Promise<T>,
  ): Promise<T>;
}
export interface PersonaOAuthClient {
  validate(clientId: string, redirectUri: string): Promise<void>;
}
