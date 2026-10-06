import type pg from "pg";
import type { OAuthPolicy } from "../../../application/use-cases/chatgpt-oauth.js";
import { oauthUnauthorized } from "../../../domain/errors/oauth-error.js";
import type { ConsumerAuth } from "../../../domain/entities/consumer-auth.js";

/** Guarda na conexão usada pelo Drizzle: não envolve chamadas de rede do hub. */
export const lockAuthorization = async (
  client: pg.PoolClient,
  auth: Extract<ConsumerAuth, { kind: "oauth" }>,
  policy: OAuthPolicy,
  accessIds: readonly string[] = [],
): Promise<() => void> => {
  // Categoria acesso inteira em ordem estável, antes de qualquer concessão/registro de negócio.
  await client.query("SELECT id FROM acesso WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE", [
    [...new Set([auth.acessoId, ...accessIds])].sort(),
  ]);
  const source = await client.query<{
    usuario_id: string;
    token_hash: string;
    status_acesso: string;
    token_expires_at: Date | null;
  }>(
    "SELECT usuario_id,token_hash,status_acesso,token_expires_at FROM acesso WHERE id=$1 FOR UPDATE",
    [auth.acessoId],
  );
  const grant = await client.query<{
    data: {
      acessoId: string;
      usuarioId: string;
      sourceHash: string;
      clientId: string;
      redirectUri: string;
      resource: string;
      scope: string;
      revokedAt?: number;
      expiresAt: number;
    };
  }>("SELECT data FROM oauth_grant WHERE id=$1 FOR UPDATE", [auth.grantId]);
  const s = source.rows[0],
    g = grant.rows[0]?.data,
    now = Date.now();
  if (
    !s ||
    !g ||
    s.usuario_id !== auth.usuarioId ||
    s.token_hash !== auth.sourceHash ||
    s.status_acesso === "revoked" ||
    (s.token_expires_at && s.token_expires_at.getTime() <= now) ||
    g.acessoId !== auth.acessoId ||
    g.usuarioId !== auth.usuarioId ||
    g.sourceHash !== auth.sourceHash ||
    g.revokedAt !== undefined ||
    g.expiresAt <= now ||
    auth.expiresAt <= now ||
    !policy.accesses.includes(auth.acessoId) ||
    !policy.clients[g.clientId]?.includes(g.redirectUri) ||
    g.resource !== policy.resource ||
    g.scope !== "se7e:access"
  )
    throw oauthUnauthorized();
  return () => {
    if (
      auth.expiresAt <= Date.now() ||
      g.expiresAt <= Date.now() ||
      (s.token_expires_at !== null && s.token_expires_at.getTime() <= Date.now()) ||
      !policy.accesses.includes(auth.acessoId) ||
      !policy.clients[g.clientId]?.includes(g.redirectUri)
    )
      throw oauthUnauthorized();
  };
};
