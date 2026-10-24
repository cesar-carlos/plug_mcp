import type pg from "pg";
import type { SourcePublicationImpact } from "../../../domain/persona-v2/model.js";

/** Uses the same closure as suspension; no credentials, SQL or results are selected. */
export async function sourcePublicationImpact(
  client: pg.PoolClient,
  personaId: string,
  sourceId: string,
): Promise<SourcePublicationImpact> {
  const result = await client.query<
    SourcePublicationImpact["publications"][number] & { total: number }
  >(
    `WITH RECURSIVE affected(persona_id,publicacao_id) AS (
      SELECT persona_id,publicacao_id FROM publicacao_fonte WHERE persona_id=$1 AND fonte_id=$2
      UNION SELECT d.persona_id,d.publicacao_id FROM publicacao_dependencia d JOIN affected a
        ON a.persona_id=d.persona_id AND a.publicacao_id=d.dependencia_id
    ) SELECT p.id AS "publicationId",p.skill_id AS "skillId",COALESCE(p.pacote->>'name','Publicação '||p.id::text) AS name,
      p.revisao AS revision,s.tipo AS kind,
      EXISTS(SELECT 1 FROM publicacao_fonte f WHERE f.persona_id=p.persona_id
        AND f.publicacao_id=p.id AND f.fonte_id=$2) AS direct,
      COALESCE(s.publicacao_ativa_id=p.id AND x.publicacao_id IS NULL,false) AS active,
      (x.publicacao_id IS NOT NULL) AS suspended,count(*) OVER()::int AS total
      FROM affected a JOIN publicacao p ON p.persona_id=a.persona_id AND p.id=a.publicacao_id
      JOIN skill_v2 s ON s.persona_id=p.persona_id AND s.id=p.skill_id
      LEFT JOIN publicacao_suspensao x ON x.persona_id=p.persona_id AND x.publicacao_id=p.id
      ORDER BY p.id LIMIT 200`,
    [personaId, sourceId],
  );
  return {
    total: result.rows[0]?.total ?? 0,
    publications: result.rows.map(({ total: _total, ...row }) => row),
  };
}

/** Suspends only packages linked to these persona-source bindings, including transitive dependents. */
export async function suspendSourcePublications(
  client: pg.PoolClient,
  sourceIds: readonly string[],
  reason: string,
): Promise<void> {
  await client.query(
    `WITH RECURSIVE affected(persona_id,publicacao_id) AS (
      SELECT persona_id,publicacao_id FROM publicacao_fonte WHERE fonte_id=ANY($1::uuid[])
      UNION SELECT d.persona_id,d.publicacao_id FROM publicacao_dependencia d JOIN affected a
        ON a.persona_id=d.persona_id AND a.publicacao_id=d.dependencia_id
    ), suspended AS (
      INSERT INTO publicacao_suspensao(persona_id,publicacao_id,motivo)
      SELECT persona_id,publicacao_id,$2 FROM affected ON CONFLICT DO NOTHING RETURNING persona_id,publicacao_id
    ) INSERT INTO audit_v2(id,persona_id,skill_id,publicacao_id,evento,origem,sucesso,resource_version)
      SELECT gen_random_uuid(),p.persona_id,p.skill_id,p.id,'skill_publicacao_suspensa','source',true,p.revisao
      FROM suspended x JOIN publicacao p ON p.persona_id=x.persona_id AND p.id=x.publicacao_id`,
    [sourceIds, reason],
  );
}
