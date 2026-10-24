import type pg from "pg";
import type {
  HistoryFilter,
  HistoryItem,
  HistoryPage,
} from "../../../domain/persona-v2/console.js";

/** Select only approved metadata, never join payloads, credentials or draft content. */
export async function personaHistory(
  client: pg.PoolClient,
  personaId: string,
  f: HistoryFilter,
): Promise<HistoryPage> {
  const r = await client.query<{
    id: string;
    at: string;
    evento: string;
    origem: string;
    sucesso: boolean;
    responsavel_id: string | null;
    token_id: string | null;
    actor_token_id: string | null;
    resource_id: string;
    previous_version: number | null;
    resource_version: number | null;
  }>(
    `SELECT id,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS at,
    evento,origem,sucesso,responsavel_id,token_id,actor_token_id,
    coalesce(attachment_id,oauth_grant_id,operacao_id,publicacao_id,skill_id,fonte_id,integracao_id,token_id,persona_id) AS resource_id,
    previous_version,resource_version FROM audit_v2
    WHERE persona_id=$1 AND ($2::timestamptz IS NULL OR created_at >= $2)
    AND ($3::timestamptz IS NULL OR created_at <= $3)
    AND ($4::text IS NULL OR evento=$4)
    AND ($5::uuid IS NULL OR $5 IN (persona_id,fonte_id,skill_id,publicacao_id,token_id,operacao_id,integracao_id,oauth_grant_id,attachment_id))
    AND ($6::timestamptz IS NULL OR (created_at,id)<($6::timestamptz,$7::uuid))
    ORDER BY created_at DESC,id DESC LIMIT 51`,
    [
      personaId,
      f.from ?? null,
      f.to ?? null,
      f.event ?? null,
      f.resourceId ?? null,
      f.after?.at ?? null,
      f.after?.id ?? null,
    ],
  );
  const items: HistoryItem[] = r.rows.slice(0, 50).map((row) => ({
    id: row.id,
    at: row.at,
    event: row.evento,
    origin: row.origem,
    success: row.sucesso,
    actor: {
      kind: row.actor_token_id
        ? "token"
        : row.responsavel_id
          ? "responsavel"
          : row.token_id
            ? "token"
            : "nao_registrado",
      id: row.actor_token_id ?? row.responsavel_id ?? row.token_id,
    },
    resourceId: row.resource_id,
    previousVersion: row.previous_version,
    version: row.resource_version,
  }));
  const last = items.at(-1);
  return { items, nextCursor: r.rows.length > 50 && last ? { at: last.at, id: last.id } : null };
}
