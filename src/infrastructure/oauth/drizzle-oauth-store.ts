import { eq, lt } from "drizzle-orm";
import type { Db } from "../persistence/drizzle/db.js";
import * as schema from "../persistence/schema.js";
import type { AuthCode, OAuthClient, OAuthStorePort, RefreshRow } from "./oauth-store.port.js";

const parseUris = (raw: string): string[] => JSON.parse(raw) as string[];

export class DrizzleOAuthStore implements OAuthStorePort {
  constructor(private readonly db: Db) {}

  async saveClient(client: OAuthClient): Promise<void> {
    await this.db
      .insert(schema.oauthClient)
      .values({
        clientId: client.clientId,
        clientSecretHash: client.clientSecretHash,
        clientName: client.clientName,
        redirectUris: JSON.stringify(client.redirectUris),
      })
      .onConflictDoUpdate({
        target: schema.oauthClient.clientId,
        set: {
          clientSecretHash: client.clientSecretHash,
          clientName: client.clientName,
          redirectUris: JSON.stringify(client.redirectUris),
        },
      });
  }

  async getClient(clientId: string): Promise<OAuthClient | null> {
    const rows = await this.db
      .select()
      .from(schema.oauthClient)
      .where(eq(schema.oauthClient.clientId, clientId));
    const row = rows[0];
    if (!row) return null;
    return {
      clientId: row.clientId,
      clientSecretHash: row.clientSecretHash,
      clientName: row.clientName,
      redirectUris: parseUris(row.redirectUris),
    };
  }

  async saveCode(code: AuthCode): Promise<void> {
    await this.db.insert(schema.oauthAuthCode).values(code);
  }

  async consumeCode(code: string): Promise<AuthCode | null> {
    const rows = await this.db
      .delete(schema.oauthAuthCode)
      .where(eq(schema.oauthAuthCode.code, code))
      .returning();
    return rows[0] ?? null;
  }

  async saveRefresh(row: RefreshRow): Promise<void> {
    await this.db.insert(schema.oauthRefreshToken).values(row);
  }

  async getRefresh(tokenHash: string): Promise<RefreshRow | null> {
    const rows = await this.db
      .select()
      .from(schema.oauthRefreshToken)
      .where(eq(schema.oauthRefreshToken.tokenHash, tokenHash));
    return rows[0] ?? null;
  }

  async revokeRefresh(tokenHash: string): Promise<void> {
    await this.db
      .update(schema.oauthRefreshToken)
      .set({ revokedAt: new Date() })
      .where(eq(schema.oauthRefreshToken.tokenHash, tokenHash));
  }

  async purgeExpired(now = new Date()): Promise<number> {
    const codes = await this.db
      .delete(schema.oauthAuthCode)
      .where(lt(schema.oauthAuthCode.expiresAt, now))
      .returning({ code: schema.oauthAuthCode.code });
    const tokens = await this.db
      .delete(schema.oauthRefreshToken)
      .where(lt(schema.oauthRefreshToken.expiresAt, now))
      .returning({ tokenHash: schema.oauthRefreshToken.tokenHash });
    return codes.length + tokens.length;
  }
}
