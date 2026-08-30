import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { escopoVazio } from "../../src/domain/entities/escopo.js";
import { createDb } from "../../src/infrastructure/persistence/drizzle/db.js";
import {
  DrizzleAnotacaoGrafoRepository,
  DrizzleAprendizadoRepository,
  DrizzleSkillRepository,
} from "../../src/infrastructure/persistence/drizzle/drizzle-cofre.js";

const dbUrl = process.env.DATABASE_URL;

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
      expect(byMetrica.some((item) => item.id === skill.id)).toBe(true);

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
      expect(notas.some((item) => item.skillId === skill.id)).toBe(true);

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
      await pool.end();
    }
  });
});
