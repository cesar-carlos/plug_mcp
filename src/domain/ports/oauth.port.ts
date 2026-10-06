import type { ConsumerAuth } from "../entities/consumer-auth.js";

export interface OAuthBinding {
  clientId: string;
  redirectUri: string;
  resource: string;
  scope: string;
  challenge: string;
}
export interface OAuthTransaction extends OAuthBinding {
  id: string;
  state?: string;
  nonceHash: string;
  csrfHash: string;
  expiresAt: number;
  status: "pending" | "authenticated" | "consumed";
  acessoId?: string;
  usuarioId?: string;
  sourceHash?: string;
}
export interface OAuthCode extends OAuthBinding {
  id: string;
  acessoId: string;
  usuarioId: string;
  sourceHash: string;
  expiresAt: number;
  consumedAt?: number;
  grantId?: string;
}
export interface OAuthGrant {
  id: string;
  acessoId: string;
  usuarioId: string;
  sourceHash: string;
  clientId: string;
  redirectUri: string;
  resource: string;
  scope: string;
  expiresAt: number;
  createdAt: number;
  revokedAt?: number;
}
export interface OAuthToken {
  id: string;
  grantId: string;
  acessoId: string;
  expiresAt: number;
  consumedAt?: number;
  successorHash?: string;
}
export interface OAuthRecords {
  transaction: OAuthTransaction;
  code: OAuthCode;
  grant: OAuthGrant;
  access: OAuthToken;
  refresh: OAuthToken;
}
export interface OAuthSource {
  id: string;
  usuarioId: string;
  tokenHash: string;
  tokenExpiresAt: Date | null;
  statusAcesso: string;
}
export interface OAuthUnitOfWork {
  get<K extends keyof OAuthRecords>(kind: K, id: string): Promise<OAuthRecords[K] | null>;
  put<K extends keyof OAuthRecords>(kind: K, row: OAuthRecords[K]): Promise<void>;
  source(id: string): Promise<OAuthSource | null>;
}
export interface OAuthStorePort {
  list<K extends "grant" | "code" | "transaction">(kind: K): Promise<OAuthRecords[K][]>;
  get<K extends keyof OAuthRecords>(kind: K, id: string): Promise<OAuthRecords[K] | null>;
  transaction<T>(
    accessId: string | null,
    grantId: string | null,
    operation: (tx: OAuthUnitOfWork) => Promise<T>,
  ): Promise<T>;
  revokeAll(now: number): Promise<void>;
  purgeExpired(now: number): Promise<void>;
}
export interface OAuthClientPort {
  validate(clientId: string, redirectUri: string): Promise<void>;
}
export interface ConsumerAuthorizationPort {
  assert(auth: ConsumerAuth): Promise<void>;
  assertGrant(grantId: string): Promise<ConsumerAuth>;
}
