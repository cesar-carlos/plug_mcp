import { randomUUID } from "node:crypto";
import type pg from "pg";
import type { CryptoPort } from "../../../domain/ports/crypto.port.js";
import type {
  PersonaOAuthConnection,
  PersonaOAuthConnectionPage,
  PersonaOAuthConnectionTransaction,
} from "../../../domain/persona-v2/oauth-connections.js";
import { PersonaV2Error } from "../../../domain/persona-v2/model.js";
import { canonicalJson } from "../../../domain/persona-v2/catalog.js";
import { parsePermissions } from "./permissions-schema.js";
interface Row {
  id: string;
  persona_id: string;
  token_id: string;
  token_version: number;
  permissoes: unknown;
  client_id: string;
  created_at: Date | null;
  expires_at: Date;
  revoked_at: Date | null;
  token_name: string;
  token_current: number;
  token_revoked: Date | null;
  token_expires: Date | null;
  active: boolean;
  now: Date;
}
const selection = `SELECT g.*,t.nome AS token_name,t.authorization_version AS token_current,t.revoked_at AS token_revoked,
 t.expires_at AS token_expires,p.ativa AS active,clock_timestamp() AS now
 FROM oauth_concessao_v2 g JOIN persona_token t ON t.persona_id=g.persona_id AND t.id=g.token_id JOIN persona p ON p.id=g.persona_id`;
export class PostgresPersonaOAuthConnections implements PersonaOAuthConnectionTransaction {
  constructor(
    private readonly db: pg.PoolClient,
    private readonly crypto?: CryptoPort,
  ) {}
  private map(row: Row): PersonaOAuthConnection {
    if (!this.crypto) throw new Error("OAuth administrative keyring required");
    const permissions = parsePermissions(row.permissoes);
    const fingerprint = this.crypto.sha256Hex(
      canonicalJson({
        id: row.id,
        personaId: row.persona_id,
        tokenId: row.token_id,
        tokenVersion: row.token_version,
        clientId: row.client_id,
        permissions,
        expiresAt: row.expires_at.toISOString(),
        createdAt: row.created_at?.toISOString() ?? null,
      }),
    );
    return {
      id: row.id,
      tokenId: row.token_id,
      tokenName: row.token_name,
      clientId: row.client_id,
      permissions,
      fingerprint,
      createdAt: row.created_at?.toISOString() ?? null,
      expiresAt: row.expires_at.toISOString(),
      revokedAt: row.revoked_at?.toISOString() ?? null,
      state: row.revoked_at
        ? "revogada"
        : row.expires_at <= row.now
          ? "expirada"
          : !row.active ||
              row.token_revoked ||
              row.token_current !== row.token_version ||
              (row.token_expires && row.token_expires <= row.now)
            ? "bloqueada"
            : "vigente_localmente",
    };
  }
  async list(persona: string, after?: string): Promise<PersonaOAuthConnectionPage> {
    const result = await this.db.query<Row>(
      `${selection} WHERE g.persona_id=$1
     AND ($2::uuid IS NULL OR (coalesce(g.created_at,'-infinity'::timestamptz),g.id)<
      (SELECT coalesce(c.created_at,'-infinity'::timestamptz),c.id FROM oauth_concessao_v2 c WHERE c.id=$2 AND c.persona_id=$1))
     ORDER BY g.created_at DESC NULLS LAST,g.id DESC LIMIT 21`,
      [persona, after ?? null],
    );
    return {
      items: result.rows.slice(0, 20).map((r) => this.map(r)),
      nextCursor: result.rows.length > 20 ? result.rows[19]!.id : null,
      remoteAuthority: "nao_verificado",
    };
  }
  async find(persona: string, id: string): Promise<PersonaOAuthConnection | null> {
    const row = (
      await this.db.query<Row>(`${selection} WHERE g.persona_id=$1 AND g.id=$2`, [persona, id])
    ).rows[0];
    return row ? this.map(row) : null;
  }
  async revoke(
    persona: string,
    id: string,
    fingerprint: string,
  ): Promise<{ id: string; status: "revoked"; revokedAt: string }> {
    const row = (
      await this.db.query<Row>(`${selection} WHERE g.persona_id=$1 AND g.id=$2 FOR UPDATE OF g`, [
        persona,
        id,
      ])
    ).rows[0];
    if (!row)
      throw new PersonaV2Error("AUTHORIZATION_DENIED", "Conexão indisponível nesta persona.");
    const snapshot = this.map(row);
    if (snapshot.fingerprint !== fingerprint)
      throw new PersonaV2Error(
        "OPERATION_CONFLICT",
        "Conexão mudou; recarregue antes de confirmar.",
      );
    if (snapshot.revokedAt) return { id, status: "revoked", revokedAt: snapshot.revokedAt };
    const changed = await this.db.query<{ revoked_at: Date }>(
      "UPDATE oauth_concessao_v2 SET revoked_at=clock_timestamp() WHERE persona_id=$1 AND id=$2 AND revoked_at IS NULL RETURNING revoked_at",
      [persona, id],
    );
    if (changed.rowCount !== 1) throw new PersonaV2Error("OPERATION_CONFLICT", "Conexão alterada.");
    await this.db.query(
      "INSERT INTO audit_v2(id,persona_id,token_id,oauth_grant_id,evento,origem,sucesso,resource_version) VALUES($1,$2,$3,$4,'oauth.revoked','admin',true,$5)",
      [randomUUID(), persona, row.token_id, id, row.token_version],
    );
    return { id, status: "revoked", revokedAt: changed.rows[0]!.revoked_at.toISOString() };
  }
}
