import type { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { escopoVazio } from "../../src/domain/entities/escopo.js";
import { stemPortugues } from "../../src/domain/entities/stem-portugues.js";
import { createDb } from "../../src/infrastructure/persistence/drizzle/db.js";
import {
  DrizzleAnotacaoGrafoRepository,
  DrizzleAprendizadoRepository,
  DrizzleSkillRepository,
} from "../../src/infrastructure/persistence/drizzle/drizzle-cofre.js";

const dbUrl = process.env.DATABASE_URL;

if ((process.env.CI === "true" || process.env.CI === "1") && !dbUrl) {
  throw new Error("CI=true exige DATABASE_URL para o teste FTS (conhecimento-fts).");
}

const limparAgent = async (pool: Pool, agentId: string): Promise<void> => {
  await pool.query("DELETE FROM consulta_aprendida WHERE agent_id = $1", [agentId]);
  await pool.query("DELETE FROM anotacao_grafo WHERE agent_id = $1", [agentId]);
  await pool.query("DELETE FROM skill WHERE agent_id = $1", [agentId]);
};

describe.skipIf(!dbUrl)("FTS conhecimento (Postgres)", () => {
  it("acha skill pela definicao da metrica e anotacao pelo texto da regra", async () => {
    const { db, pool } = createDb(dbUrl!);
    const skills = new DrizzleSkillRepository(db);
    const anotacoes = new DrizzleAnotacaoGrafoRepository(db);
    const aprendizado = new DrizzleAprendizadoRepository(db);
    const agentId = randomUUID();
    try {
      const skill = await skills.create({
        agentId,
        slug: `fts-${agentId.slice(0, 8)}`,
        nome: "Contas",
        descricao: "Titulos em aberto",
        sqlModelo: "SELECT 1 AS n",
        escopo: {
          ...escopoVazio(),
          metricasSaida: [
            {
              alias: "margem",
              expr: "x",
              definicao: "indicadorxyzabc da margem comercial",
            },
          ],
        },
        autorUsuarioId: null,
      });
      const byMetrica = await skills.buscar(agentId, "indicadorxyzabc", 8);
      expect(byMetrica.some((hit) => hit.item.id === skill.id)).toBe(true);

      await anotacoes.create({
        agentId,
        tabelaId: null,
        skillId: skill.id,
        tipo: "regra",
        titulo: "Formula",
        texto: "regratesouroxyz usa preco de venda no denominador.",
        autorUsuarioId: null,
      });
      const notas = await anotacoes.buscar(agentId, "regratesouroxyz", 8);
      expect(notas.some((hit) => hit.item.skillId === skill.id)).toBe(true);

      await aprendizado.salvarConsulta({
        agentId,
        skillIds: [skill.id],
        pergunta: "lista de itens do catalogo",
        sql: "SELECT p.codprodunico FROM produto p",
        paramsContrato: [],
        autorUsuarioId: null,
      });
      const bySql = await aprendizado.buscarConsultas(agentId, "codprodunico", 5);
      expect(bySql).toHaveLength(0);
      const byPergunta = await aprendizado.buscarConsultas(agentId, "catalogo", 5);
      expect(byPergunta.length).toBeGreaterThan(0);
    } finally {
      await limparAgent(pool, agentId);
      await pool.end();
    }
  });

  it("stemming portuguese casa titulos com titulo", async () => {
    const { db, pool } = createDb(dbUrl!);
    const skills = new DrizzleSkillRepository(db);
    const anotacoes = new DrizzleAnotacaoGrafoRepository(db);
    const agentId = randomUUID();
    try {
      const probe = await pool.query<{ ok: boolean | string }>(
        `select to_tsvector('portuguese', 'titulo') @@ plainto_tsquery('portuguese', 'titulos') as ok`,
      );
      const stemmingAtivo =
        probe.rows[0]?.ok === true || probe.rows[0]?.ok === "t" || probe.rows[0]?.ok === "true";
      expect(stemmingAtivo).toBe(true);
      const skill = await skills.create({
        agentId,
        slug: `stem-${agentId.slice(0, 8)}`,
        nome: "Contas",
        descricao: "Saldos em aberto",
        sqlModelo: "SELECT 1 AS n",
        escopo: {
          ...escopoVazio(),
          metricasSaida: [{ alias: "m", expr: "x", definicao: "titulo comercial no denominador" }],
        },
        autorUsuarioId: null,
      });
      await anotacoes.create({
        agentId,
        tabelaId: null,
        skillId: skill.id,
        tipo: "regra",
        titulo: "Formula",
        texto: "O calculo do titulo usa preco de venda.",
        autorUsuarioId: null,
      });
      const bySkill = await skills.buscar(agentId, "titulos", 8);
      expect(bySkill.some((hit) => hit.item.id === skill.id)).toBe(true);
      const notas = await anotacoes.buscar(agentId, "titulos", 8);
      expect(notas.some((hit) => hit.item.skillId === skill.id)).toBe(true);
    } finally {
      await limparAgent(pool, agentId);
      await pool.end();
    }
  });

  it("lexema JS alinha com to_tsvector portuguese em titulo/titulos", async () => {
    const { pool } = createDb(dbUrl!);
    try {
      const js = stemPortugues("titulo");
      expect(js).toBe(stemPortugues("titulos"));
      const titulo = await pool.query<{ lex: string }>(
        `select unnest(tsvector_to_array(to_tsvector('portuguese', 'titulo'))) as lex`,
      );
      const titulos = await pool.query<{ lex: string }>(
        `select unnest(tsvector_to_array(to_tsvector('portuguese', 'titulos'))) as lex`,
      );
      expect(titulo.rows.map((row) => row.lex)).toEqual(titulos.rows.map((row) => row.lex));
      expect(titulo.rows.some((row) => row.lex === js)).toBe(true);
    } finally {
      await pool.end();
    }
  });
});
