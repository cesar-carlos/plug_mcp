import pg from "pg";
import { loadConfig } from "../../config/env.js";
import { PACOTE_VERSAO_ATUAL, type EscopoSkill } from "../../domain/entities/escopo.js";
import { QUERY_CACHE_PREFIX } from "../../application/use-cases/shared/query-cache-key.js";
import {
  associarAnotacaoASkill,
  associarConsultaASkills,
  emptyReport,
  reconstruirEscopoOuErro,
  type BackfillReportAgent,
} from "../../application/use-cases/shared/backfill-pacote.js";
import { isDialeto } from "../../domain/entities/dialeto.js";

const flushQueryCache = async (redisUrl: string): Promise<number> => {
  if (!redisUrl) {
    return 0;
  }
  const { createClient } = await import("redis");
  const redis = createClient({ url: redisUrl });
  await redis.connect();
  try {
    const keys: string[] = [];
    for await (const item of redis.scanIterator({ MATCH: `${QUERY_CACHE_PREFIX}*` })) {
      if (typeof item === "string") {
        keys.push(item);
      } else {
        keys.push(...item);
      }
    }
    if (keys.length === 0) {
      return 0;
    }
    for (const key of keys) {
      await redis.del(key);
    }
    return keys.length;
  } finally {
    await redis.quit();
  }
};

const run = async (): Promise<void> => {
  const config = loadConfig();
  if (!config.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to backfill skill packages");
  }
  const flushed = await flushQueryCache(config.REDIS_URL);
  const client = new pg.Client({ connectionString: config.DATABASE_URL });
  await client.connect();
  try {
    const skills = await client.query<{
      id: string;
      agent_id: string;
      sql_modelo: string;
      status: string;
      dialeto: string | null;
    }>(`
      SELECT s.id, s.agent_id, s.sql_modelo, s.status, (
        SELECT a.dialeto FROM acesso a WHERE a.agent_id = s.agent_id ORDER BY a.updated_at DESC LIMIT 1
      ) AS dialeto
      FROM skill s
    `);
    const report: Record<string, BackfillReportAgent> = {};
    const escopos = new Map<string, EscopoSkill>();
    for (const row of skills.rows) {
      const agent = report[row.agent_id] ?? emptyReport();
      const rebuilt = reconstruirEscopoOuErro(row.sql_modelo);
      if (!rebuilt.ok) {
        agent.orfas += 1;
        await client.query(
          `UPDATE skill SET status = 'rascunho_revalidacao', motivo_revalidacao = $2, pacote_versao = $3, updated_at = now() WHERE id = $1`,
          [row.id, rebuilt.motivo, PACOTE_VERSAO_ATUAL],
        );
        report[row.agent_id] = agent;
        continue;
      }
      escopos.set(row.id, rebuilt.escopo);
      await client.query(
        `UPDATE skill SET escopo = $2::jsonb, pacote_versao = $3, motivo_revalidacao = NULL, updated_at = now() WHERE id = $1`,
        [row.id, JSON.stringify(rebuilt.escopo), PACOTE_VERSAO_ATUAL],
      );
      agent.migradas += 1;
      if (row.status === "publicada") {
        await client.query(
          `UPDATE skill SET status = 'rascunho_revalidacao', motivo_revalidacao = $2, updated_at = now() WHERE id = $1`,
          [
            row.id,
            "Cutover do pacote: reconstrua/valide a skill (validar_skill → publicar_skill).",
          ],
        );
        agent.rebaixadas += 1;
      } else {
        agent.revalidadas += 1;
      }
      report[row.agent_id] = agent;
    }

    const consultas = await client.query<{ id: string; agent_id: string; sql: string }>(
      `SELECT id, agent_id, sql FROM consulta_aprendida`,
    );
    await client.query(`DELETE FROM consulta_aprendida_skill`);
    for (const consulta of consultas.rows) {
      const doAgent = skills.rows
        .filter((skill) => skill.agent_id === consulta.agent_id && escopos.has(skill.id))
        .map((skill) => {
          const escopo = escopos.get(skill.id);
          return escopo ? { id: skill.id, escopo } : null;
        })
        .filter((item): item is { id: string; escopo: EscopoSkill } => item !== null);
      const rawDialeto =
        skills.rows.find((skill) => skill.agent_id === consulta.agent_id)?.dialeto ?? "sybase";
      const dialeto = isDialeto(rawDialeto) ? rawDialeto : "sybase";
      const assoc = associarConsultaASkills(consulta.sql, dialeto, doAgent);
      if (assoc.inativa) {
        await client.query(`UPDATE consulta_aprendida SET status = 'inativa' WHERE id = $1`, [
          consulta.id,
        ]);
        continue;
      }
      for (const skillId of assoc.skillIds) {
        await client.query(
          `INSERT INTO consulta_aprendida_skill (consulta_id, skill_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [consulta.id, skillId],
        );
      }
    }

    const tabelas = await client.query<{ id: string; agent_id: string; nome: string }>(
      `SELECT id, agent_id, nome FROM tabela_grafo`,
    );
    const tabelaNome = new Map(tabelas.rows.map((item) => [item.id, item]));
    const anotacoes = await client.query<{
      id: string;
      agent_id: string;
      tabela_id: string | null;
      skill_id: string | null;
    }>(`SELECT id, agent_id, tabela_id, skill_id FROM anotacao_grafo`);
    for (const nota of anotacoes.rows) {
      const tabela = nota.tabela_id ? tabelaNome.get(nota.tabela_id) : undefined;
      const doAgent = skills.rows
        .filter((skill) => skill.agent_id === nota.agent_id && escopos.has(skill.id))
        .map((skill) => {
          const escopo = escopos.get(skill.id);
          return escopo ? { id: skill.id, escopo } : null;
        })
        .filter((item): item is { id: string; escopo: EscopoSkill } => item !== null);
      const skillId = associarAnotacaoASkill(
        {
          id: nota.id,
          agentId: nota.agent_id,
          tabelaId: nota.tabela_id,
          skillId: nota.skill_id,
        },
        tabela?.nome ?? null,
        doAgent,
      );
      if (skillId && skillId !== nota.skill_id) {
        await client.query(`UPDATE anotacao_grafo SET skill_id = $2 WHERE id = $1`, [
          nota.id,
          skillId,
        ]);
      }
    }

    console.log("backfill pacote", JSON.stringify({ flushed, report }, null, 2));
  } finally {
    await client.end();
  }
};

run().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
