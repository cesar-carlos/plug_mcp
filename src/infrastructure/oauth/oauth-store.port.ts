export interface OAuthClient {
  clientId: string;
  clientSecretHash: string | null;
  clientName: string;
  redirectUris: string[];
}

export interface AuthCode {
  code: string;
  clientId: string;
  accountId: string;
  redirectUri: string;
  codeChallenge: string;
  resource: string | null;
  expiresAt: Date;
}

export interface RefreshRow {
  tokenHash: string;
  clientId: string;
  accountId: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface OAuthStorePort {
  saveClient(client: OAuthClient): Promise<void>;
  getClient(clientId: string): Promise<OAuthClient | null>;
  saveCode(code: AuthCode): Promise<void>;
  consumeCode(code: string): Promise<AuthCode | null>;
  saveRefresh(row: RefreshRow): Promise<void>;
  getRefresh(tokenHash: string): Promise<RefreshRow | null>;
  revokeRefresh(tokenHash: string): Promise<void>;
  purgeExpired(now?: Date): Promise<number>;
}
