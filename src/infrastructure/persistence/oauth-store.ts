import type pg from "pg";
import { z } from "zod";
import type { AcessoRepositoryPort } from "../../domain/ports/acesso-repository.port.js";
import type {
  OAuthRecords,
  OAuthSource,
  OAuthStorePort,
  OAuthUnitOfWork,
} from "../../domain/ports/oauth.port.js";

const binding = {
  clientId: z.string(),
  redirectUri: z.string(),
  resource: z.string(),
  scope: z.string(),
  challenge: z.string(),
};
const token = z.object({
  id: z.string(),
  grantId: z.string(),
  acessoId: z.string(),
  expiresAt: z.number(),
  consumedAt: z.number().optional(),
  successorHash: z.string().optional(),
});
const schemas = {
  transaction: z.object({
    ...binding,
    id: z.string(),
    state: z.string().optional(),
    nonceHash: z.string(),
    csrfHash: z.string(),
    expiresAt: z.number(),
    status: z.enum(["pending", "authenticated", "consumed"]),
    acessoId: z.string().optional(),
    usuarioId: z.string().optional(),
    sourceHash: z.string().optional(),
  }),
  code: z.object({
    ...binding,
    id: z.string(),
    acessoId: z.string(),
    usuarioId: z.string(),
    sourceHash: z.string(),
    expiresAt: z.number(),
    consumedAt: z.number().optional(),
    grantId: z.string().optional(),
  }),
  grant: z.object({
    id: z.string(),
    acessoId: z.string(),
    usuarioId: z.string(),
    sourceHash: z.string(),
    clientId: z.string(),
    redirectUri: z.string(),
    resource: z.string(),
    scope: z.string(),
    expiresAt: z.number(),
    createdAt: z.number(),
    revokedAt: z.number().optional(),
  }),
  access: token,
  refresh: token,
};
const parse = <K extends keyof OAuthRecords>(kind: K, value: unknown): OAuthRecords[K] =>
  schemas[kind].parse(value) as OAuthRecords[K];
const tables = {
  transaction: "oauth_transaction",
  code: "oauth_code",
  grant: "oauth_grant",
  access: "oauth_access_token",
  refresh: "oauth_refresh_token",
} as const;

export class MemoryOAuthStore implements OAuthStorePort {
  private records = new Map<string, unknown>();
  private tail: Promise<unknown> = Promise.resolve();
  constructor(private readonly accesses: AcessoRepositoryPort) {}
  list<K extends "grant" | "code" | "transaction">(kind: K): Promise<OAuthRecords[K][]> {
    return Promise.resolve(
      [...this.records.entries()]
        .filter(([key]) => key.startsWith(`${kind}:`))
        .map(([, value]) => parse(kind, structuredClone(value))),
    );
  }
  get<K extends keyof OAuthRecords>(kind: K, id: string): Promise<OAuthRecords[K] | null> {
    const value = this.records.get(`${kind}:${id}`);
    return Promise.resolve(value ? parse(kind, structuredClone(value)) : null);
  }
  async transaction<T>(
    _accessId: string | null,
    _grantId: string | null,
    operation: (tx: OAuthUnitOfWork) => Promise<T>,
  ): Promise<T> {
    const run = this.tail.then(async () => {
      const working = structuredClone(this.records);
      const result = await operation({
        get: (kind, id) => {
          const row = working.get(`${kind}:${id}`);
          return Promise.resolve(row ? parse(kind, structuredClone(row)) : null);
        },
        put: (kind, row) => {
          working.set(`${kind}:${row.id}`, structuredClone(row));
          return Promise.resolve();
        },
        source: (id) => this.accesses.findById(id),
      });
      this.records = working;
      return result;
    });
    this.tail = run.catch(() => undefined);
    return run;
  }
  async revokeAll(now: number): Promise<void> {
    await this.transaction(null, null, async (tx) => {
      for (const [key, value] of this.records) {
        if (key.startsWith("grant:"))
          await tx.put("grant", { ...parse("grant", value), revokedAt: now });
        if (key.startsWith("transaction:"))
          await tx.put("transaction", { ...parse("transaction", value), status: "consumed" });
        if (key.startsWith("code:"))
          await tx.put("code", { ...parse("code", value), expiresAt: 0, consumedAt: now });
      }
    });
  }
  async purgeExpired(now: number): Promise<void> {
    const run = this.tail.then(() => {
      for (const [key, value] of this.records) {
        const row = value as { expiresAt: number };
        // Códigos consumidos permanecem durante a validade máxima da concessão.
        if (row.expiresAt + (key.startsWith("code:") ? 30 * 86_400_000 : 0) < now)
          this.records.delete(key);
      }
    });
    this.tail = run.catch(() => undefined);
    await run;
  }
}

type Queryable = Pick<pg.Pool, "query">;
const get = async <K extends keyof OAuthRecords>(
  db: Queryable,
  kind: K,
  id: string,
  lock = false,
): Promise<OAuthRecords[K] | null> => {
  const rows = await db.query<{ data: unknown }>(
    `SELECT data FROM ${tables[kind]} WHERE id=$1${lock ? " FOR UPDATE" : ""}`,
    [id],
  );
  return rows.rows[0] ? parse(kind, rows.rows[0].data) : null;
};

export class PostgresOAuthStore implements OAuthStorePort {
  constructor(private readonly pool: pg.Pool) {}
  async list<K extends "grant" | "code" | "transaction">(kind: K): Promise<OAuthRecords[K][]> {
    const result = await this.pool.query<{ data: unknown }>(`SELECT data FROM ${tables[kind]}`);
    return result.rows.map((row) => parse(kind, row.data));
  }
  get<K extends keyof OAuthRecords>(kind: K, id: string): Promise<OAuthRecords[K] | null> {
    return get(this.pool, kind, id);
  }
  async transaction<T>(
    accessId: string | null,
    grantId: string | null,
    operation: (tx: OAuthUnitOfWork) => Promise<T>,
  ): Promise<T> {
    const db = await this.pool.connect();
    try {
      await db.query("BEGIN");
      if (accessId) await db.query("SELECT id FROM acesso WHERE id=$1 FOR UPDATE", [accessId]);
      if (grantId) await db.query("SELECT id FROM oauth_grant WHERE id=$1 FOR UPDATE", [grantId]);
      const result = await operation({
        get: (kind, id) => get(db, kind, id, true),
        put: async (kind, row) => {
          const grant = "grantId" in row ? row.grantId : null;
          await db.query(
            `INSERT INTO ${tables[kind]} (id,acesso_id,grant_id,expires_at,data) VALUES ($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET acesso_id=excluded.acesso_id,grant_id=excluded.grant_id,expires_at=excluded.expires_at,data=excluded.data`,
            [
              row.id,
              row.acessoId ?? null,
              grant ?? null,
              new Date(row.expiresAt),
              JSON.stringify(row),
            ],
          );
        },
        source: async (id) => {
          const result = await db.query<{
            id: string;
            usuario_id: string;
            token_hash: string;
            token_expires_at: Date | null;
            status_acesso: string;
          }>(
            "SELECT id,usuario_id,token_hash,token_expires_at,status_acesso FROM acesso WHERE id=$1",
            [id],
          );
          const row = result.rows[0];
          return row
            ? ({
                id: row.id,
                usuarioId: row.usuario_id,
                tokenHash: row.token_hash,
                tokenExpiresAt: row.token_expires_at,
                statusAcesso: row.status_acesso,
              } satisfies OAuthSource)
            : null;
        },
      });
      await db.query("COMMIT");
      return result;
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    } finally {
      db.release();
    }
  }
  async revokeAll(now: number): Promise<void> {
    const db = await this.pool.connect();
    try {
      await db.query("BEGIN");
      await db.query("SELECT id FROM acesso ORDER BY id FOR UPDATE");
      await db.query("SELECT id FROM oauth_grant ORDER BY id FOR UPDATE");
      await db.query(
        "UPDATE oauth_grant SET data=jsonb_set(data,'{revokedAt}',to_jsonb($1::bigint))",
        [now],
      );
      await db.query("UPDATE oauth_transaction SET data=jsonb_set(data,'{status}','\"consumed\"')");
      await db.query(
        "UPDATE oauth_code SET expires_at=to_timestamp(0),data=data || jsonb_build_object('expiresAt',0,'consumedAt',$1::bigint)",
        [now],
      );
      await db.query("COMMIT");
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    } finally {
      db.release();
    }
  }
  async purgeExpired(now: number): Promise<void> {
    // Grants vencidos apagam setups derivados por CASCADE; nunca tornam a proveniência NULL.
    await this.pool.query("DELETE FROM oauth_transaction WHERE expires_at < $1", [new Date(now)]);
    await this.pool.query("DELETE FROM oauth_code WHERE expires_at < $1", [
      new Date(now - 30 * 86_400_000),
    ]);
    await this.pool.query("DELETE FROM oauth_access_token WHERE expires_at < $1", [new Date(now)]);
    await this.pool.query("DELETE FROM oauth_refresh_token WHERE expires_at < $1", [new Date(now)]);
    await this.pool.query("DELETE FROM oauth_grant WHERE expires_at < $1", [new Date(now)]);
  }
}
