import type { AuthCode, OAuthClient, OAuthStorePort, RefreshRow } from "./oauth-store.port.js";

export class InMemoryOAuthStore implements OAuthStorePort {
  readonly clients = new Map<string, OAuthClient>();
  readonly codes = new Map<string, AuthCode>();
  readonly refresh = new Map<string, RefreshRow>();

  async saveClient(client: OAuthClient): Promise<void> {
    this.clients.set(client.clientId, client);
  }

  async getClient(clientId: string): Promise<OAuthClient | null> {
    return this.clients.get(clientId) ?? null;
  }

  async saveCode(code: AuthCode): Promise<void> {
    this.codes.set(code.code, code);
  }

  // Consumo único síncrono no Map — equivalente ao DELETE ... RETURNING do adapter Drizzle.
  // Sem await entre get e delete, dois callers concorrentes não reutilizam o mesmo code.
  async consumeCode(code: string): Promise<AuthCode | null> {
    const row = this.codes.get(code) ?? null;
    if (row) this.codes.delete(code);
    return row;
  }

  async saveRefresh(row: RefreshRow): Promise<void> {
    this.refresh.set(row.tokenHash, row);
  }

  async getRefresh(tokenHash: string): Promise<RefreshRow | null> {
    return this.refresh.get(tokenHash) ?? null;
  }

  async revokeRefresh(tokenHash: string): Promise<void> {
    const row = this.refresh.get(tokenHash);
    if (row) this.refresh.set(tokenHash, { ...row, revokedAt: new Date() });
  }

  async purgeExpired(now = new Date()): Promise<number> {
    let removed = 0;
    for (const [code, row] of this.codes) {
      if (row.expiresAt.getTime() <= now.getTime()) {
        this.codes.delete(code);
        removed += 1;
      }
    }
    for (const [hash, row] of this.refresh) {
      if (row.expiresAt.getTime() <= now.getTime()) {
        this.refresh.delete(hash);
        removed += 1;
      }
    }
    return removed;
  }
}
