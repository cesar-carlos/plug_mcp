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

const seedAcessoFts = async (
  pool: Pool,
): Promise<{ acessoId: string; usuarioId: string }> => {
  const usuarioId = randomUUID();
  const acessoId = randomUUID();
  await pool.query(
    `INSERT INTO usuario_mcp (id, email_enc, email_hash, senha_enc, token_hash)
     VALUES ($1, 'e', $2, 's', $3)`,
    [usuarioId, randomUUID(), randomUUID()],
  );
  await pool.query(
    `INSERT INTO acesso (id, usuario_id, agent_id, dialeto, nome_amigavel, client_token_enc, client_token_hash, status_acesso)
     VALUES ($1, $2, $3, 'mssql', 't', 'enc', $4, 'approved')`,
    [acessoId, usuarioId, randomUUID(), randomUUID()],
  );
  return { acessoId, usuarioId };
};

const limparAcessoFts = async (pool: Pool, acessoId: string, usuarioId: string): Promise<void> => {
  await pool.query("DELETE FROM acesso WHERE id = $1", [acessoId]);
  await pool.query("DELETE FROM usuario_mcp WHERE id = $1", [usuarioId]);
};

describe.skipIf(!dbUrl)("FTS conhecimento (Postgres)", () => {
  it("acha skill pela definicao da metrica e anotacao pelo texto da regra", async () => {
    const { db, pool } = createDb(dbUrl!);
    const skills = new DrizzleSkillRepository(db);
    const anotacoes = new DrizzleAnotacaoGrafoRepository(db);
    const aprendizado = new DrizzleAprendizadoRepository(db);
    const { acessoId, usuarioId } = await seedAcessoFts(pool);
    try {
      const skill = await skills.create({
        acessoId,
        slug: `fts-${acessoId.slice(0, 8)}`,
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
      const byMetrica = await skills.buscar(acessoId, "indicadorxyzabc", 8);
      expect(byMetrica.some((hit) => hit.item.id === skill.id)).toBe(true);

      await anotacoes.create({
        acessoId,
        tabelaId: null,
        skillId: skill.id,
        tipo: "regra",
        titulo: "Formula",
        texto: "regratesouroxyz usa preco de venda no denominador.",
        autorUsuarioId: null,
      });
      const notas = await anotacoes.buscar(acessoId, "regratesouroxyz", 8);
      expect(notas.some((hit) => hit.item.skillId === skill.id)).toBe(true);

      await aprendizado.salvarConsulta({
        acessoId,
        skillIds: [skill.id],
        pergunta: "lista de itens do catalogo",
        sql: "SELECT p.codprodunico FROM produto p",
        paramsContrato: [],
        autorUsuarioId: null,
      });
      const bySql = await aprendizado.buscarConsultas(acessoId, "codprodunico", 5);
      expect(bySql).toHaveLength(0);
      const byPergunta = await aprendizado.buscarConsultas(acessoId, "catalogo", 5);
      expect(byPergunta.length).toBeGreaterThan(0);
    } finally {
      await limparAcessoFts(pool, acessoId, usuarioId);
      await pool.end();
    }
  });

  it("stemming portuguese casa titulos com titulo", async () => {
    const { db, pool } = createDb(dbUrl!);
    const skills = new DrizzleSkillRepository(db);
    const anotacoes = new DrizzleAnotacaoGrafoRepository(db);
    const { acessoId, usuarioId } = await seedAcessoFts(pool);
    try {
      const probe = await pool.query<{ ok: boolean | string }>(
        `select to_tsvector('portuguese', 'titulo') @@ plainto_tsquery('portuguese', 'titulos') as ok`,
      );
      const stemmingAtivo =
        probe.rows[0]?.ok === true || probe.rows[0]?.ok === "t" || probe.rows[0]?.ok === "true";
      expect(stemmingAtivo).toBe(true);
      const skill = await skills.create({
        acessoId,
        slug: `stem-${acessoId.slice(0, 8)}`,
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
        acessoId,
        tabelaId: null,
        skillId: skill.id,
        tipo: "regra",
        titulo: "Formula",
        texto: "O calculo do titulo usa preco de venda.",
        autorUsuarioId: null,
      });
      const bySkill = await skills.buscar(acessoId, "titulos", 8);
      expect(bySkill.some((hit) => hit.item.id === skill.id)).toBe(true);
      const notas = await anotacoes.buscar(acessoId, "titulos", 8);
      expect(notas.some((hit) => hit.item.skillId === skill.id)).toBe(true);
    } finally {
      await limparAcessoFts(pool, acessoId, usuarioId);
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
