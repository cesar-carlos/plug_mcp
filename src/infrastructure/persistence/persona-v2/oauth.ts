import { randomUUID } from "node:crypto";
import type pg from "pg";
import { z } from "zod";
import type { CryptoPort } from "../../../domain/ports/crypto.port.js";
import type { ConsumerIdentity, PersonaOAuthGrant } from "../../../domain/persona-v2/model.js";
import type {
  PersonaOAuthRecord,
  PersonaOAuthStore,
  PersonaOAuthUnit,
} from "../../../domain/ports/persona-oauth.port.js";
import { permissionsSchema } from "./permissions-schema.js";
import { PostgresPersonaTransaction } from "./repository.js";

const recordSchema = z.strictObject({
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  kind: z.enum(["transaction", "code", "access_token", "refresh_token"]),
  expiresAt: z.number().int().positive(),
  consumedAt: z.number().int().positive().optional(),
  binding: z.strictObject({
    clientId: z.url(),
    redirectUri: z.url(),
    resource: z.url(),
    challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  }),
  identity: z
    .strictObject({
      personaId: z.uuid(),
      tokenId: z.uuid(),
      tokenVersion: z.number().int().positive(),
      personaVersion: z.number().int().positive(),
      grant: z
        .strictObject({ id: z.uuid(), expiresAt: z.number().int().positive().optional() })
        .optional(),
    })
    .optional(),
  permissions: permissionsSchema.optional(),
  state: z.string().max(4096).optional(),
  nonceHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  csrfHash: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
});
interface Row {
  id_hash: string;
  tipo: PersonaOAuthRecord["kind"];
  persona_id: string | null;
  concessao_id: string | null;
  expires_at: Date;
  consumed_at: Date | null;
  conteudo_enc: string;
}
const read = async (
  db: Pick<pg.Pool, "query"> | pg.PoolClient,
  hash: string,
  crypto: CryptoPort,
  lock = false,
): Promise<PersonaOAuthRecord | null> => {
  const r = await db.query<Row>(
    `SELECT * FROM oauth_registro_v2 WHERE id_hash=$1${lock ? " FOR UPDATE" : ""}`,
    [hash],
  );
  const row = r.rows[0];
  if (!row) {
    return null;
  }
  const record = recordSchema.parse(JSON.parse(crypto.decrypt(row.conteudo_enc)));
  // Bind ciphertext to its relational envelope; swapping encrypted rows is not accepted.
  if (
    record.hash !== row.id_hash ||
    record.kind !== row.tipo ||
    record.expiresAt !== row.expires_at.getTime() ||
    (record.consumedAt ?? null) !== (row.consumed_at?.getTime() ?? null) ||
    (record.identity?.personaId ?? null) !== row.persona_id ||
    (record.identity?.grant?.id ?? null) !== row.concessao_id
  ) {
    throw new Error("Registro OAuth v2 inconsistente.");
  }
  if (record.kind !== "transaction" && !record.identity?.grant) {
    throw new Error("Concessão OAuth v2 ausente.");
  }
  if (record.kind === "access_token" && record.identity?.grant?.expiresAt !== record.expiresAt) {
    throw new Error("Deadline OAuth v2 inconsistente.");
  }
  return record;
};

class Unit implements PersonaOAuthUnit {
  constructor(
    private readonly db: pg.PoolClient,
    private readonly crypto: CryptoPort,
  ) {}
  record(hash: string): Promise<PersonaOAuthRecord | null> {
    return read(this.db, hash, this.crypto, true);
  }
  authorization(identity: ConsumerIdentity) {
    return new PostgresPersonaTransaction(this.db).authorization(identity);
  }
  async put(record: PersonaOAuthRecord): Promise<void> {
    const value = recordSchema.parse(record);
    await this.db.query(
      `INSERT INTO oauth_registro_v2(id_hash,persona_id,concessao_id,tipo,expires_at,consumed_at,conteudo_enc)
      VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id_hash) DO UPDATE SET
      persona_id=excluded.persona_id,concessao_id=excluded.concessao_id,consumed_at=excluded.consumed_at,conteudo_enc=excluded.conteudo_enc`,
      [
        value.hash,
        value.identity?.personaId ?? null,
        value.identity?.grant?.id ?? null,
        value.kind,
        new Date(value.expiresAt),
        value.consumedAt === undefined ? null : new Date(value.consumedAt),
        this.crypto.encrypt(JSON.stringify(value)),
      ],
    );
  }
  async grant(grant: PersonaOAuthGrant, clientId: string): Promise<void> {
    await this.db.query(
      "INSERT INTO oauth_concessao_v2(id,persona_id,token_id,token_version,permissoes,client_id,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [
        grant.id,
        grant.personaId,
        grant.tokenId,
        grant.tokenVersion,
        JSON.stringify(grant.permissions),
        clientId,
        grant.expiresAt,
      ],
    );
    await this.db.query(
      "INSERT INTO audit_v2(id,persona_id,token_id,evento,origem,sucesso,resource_version,oauth_grant_id) VALUES($1,$2,$3,'oauth.connected','oauth',true,$4,$5)",
      [randomUUID(), grant.personaId, grant.tokenId, grant.tokenVersion, grant.id],
    );
  }
  async revoke(identity: ConsumerIdentity, now: Date): Promise<void> {
    if (!identity.grant) {
      throw new Error("Concessão necessária para revogação OAuth.");
    }
    const result = await this.db.query(
      "UPDATE oauth_concessao_v2 SET revoked_at=$4 WHERE persona_id=$1 AND token_id=$2 AND id=$3 AND revoked_at IS NULL RETURNING id",
      [identity.personaId, identity.tokenId, identity.grant.id, now],
    );
    if (result.rowCount === 1) {
      await this.db.query(
        "INSERT INTO audit_v2(id,persona_id,token_id,evento,origem,sucesso,resource_version,oauth_grant_id) VALUES($1,$2,$3,'oauth.revoked','oauth',true,$4,$5)",
        [
          randomUUID(),
          identity.personaId,
          identity.tokenId,
          identity.tokenVersion,
          identity.grant.id,
        ],
      );
    }
  }
}

/** Own v2 tables and encrypted payloads. Locks match all other v2 authorization transactions. */
export class PostgresPersonaOAuthStore implements PersonaOAuthStore {
  constructor(
    private readonly pool: pg.Pool,
    private readonly crypto: CryptoPort,
  ) {}
  record(hash: string): Promise<PersonaOAuthRecord | null> {
    return read(this.pool, hash, this.crypto);
  }
  async transaction<T>(
    identity: ConsumerIdentity | undefined,
    action: (unit: PersonaOAuthUnit) => Promise<T>,
  ): Promise<T> {
    const db = await this.pool.connect();
    try {
      await db.query("BEGIN");
      if (identity) {
        await db.query("SELECT id FROM persona WHERE id=$1 FOR UPDATE", [identity.personaId]);
        await db.query("SELECT id FROM persona_token WHERE persona_id=$1 AND id=$2 FOR UPDATE", [
          identity.personaId,
          identity.tokenId,
        ]);
        if (identity.grant) {
          await db.query(
            "SELECT id FROM oauth_concessao_v2 WHERE persona_id=$1 AND token_id=$2 AND id=$3 FOR UPDATE",
            [identity.personaId, identity.tokenId, identity.grant.id],
          );
        }
      }
      const result = await action(new Unit(db, this.crypto));
      await db.query("COMMIT");
      return result;
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    } finally {
      db.release();
    }
  }
}
