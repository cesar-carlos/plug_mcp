import { describe, expect, it } from "vitest";
import { exigirPacotePublicavel } from "../../src/application/use-cases/shared/gates-skill.js";
import { parseEscopoSkill } from "../../src/domain/entities/escopo.js";
import { ERROR_CODES } from "../../src/domain/errors/error-codes.js";
import { InMemoryGrafoRepository } from "../../src/infrastructure/persistence/memory/memory-cofre.js";

const agentId = "11111111-1111-4111-8111-111111111111";

describe("gate de publicação", () => {
  it("PERFIL_AUSENTE quando métrica existe e a coluna não tem tipo", async () => {
    const grafo = new InMemoryGrafoRepository();
    const { tabela } = await grafo.mergeTabela({
      agentId,
      nome: "receber",
      origem: "validado_execucao",
      autorUsuarioId: null,
    });
    await grafo.mergeColuna({
      tabelaId: tabela.id,
      nome: "valor",
      origem: "validado_execucao",
      autorUsuarioId: null,
    });
    const escopo = parseEscopoSkill({
      tabelas: ["receber"],
      colunasPorTabela: { receber: ["valor"] },
      metricasSaida: [{ alias: "total", expr: "SUM(receber.valor)" }],
    });
    await expect(
      exigirPacotePublicavel(
        grafo,
        agentId,
        escopo,
        "SELECT SUM(r.valor) AS total FROM receber r WHERE r.valor > 0",
      ),
    ).rejects.toMatchObject({
      code: ERROR_CODES.PERFIL_AUSENTE,
      details: { faltas: expect.any(Array) },
    });
  });
});
