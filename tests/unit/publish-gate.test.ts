import { describe, expect, it } from "vitest";
import { exigirPacotePublicavel } from "../../src/application/use-cases/shared/gates-skill.js";
import { parseEscopoSkill } from "../../src/domain/entities/escopo.js";
import { ERROR_CODES } from "../../src/domain/errors/error-codes.js";
import { InMemoryGrafoRepository } from "../../src/infrastructure/persistence/memory/memory-cofre.js";
import { seedTabelaComColunas } from "../helpers/seed-grafo.js";

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

  it("agregação em uma tabela com tipo publica (pacote mínimo)", async () => {
    const grafo = new InMemoryGrafoRepository();
    await seedTabelaComColunas(grafo, {
      agentId,
      usuarioId: "u1",
      nome: "receber",
      colunas: ["valor"],
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
    ).resolves.toBeUndefined();
  });

  it("JOIN sem cardinalidade bloqueia publicação", async () => {
    const grafo = new InMemoryGrafoRepository();
    const { tabela: receber } = await grafo.mergeTabela({
      agentId,
      nome: "receber",
      origem: "validado_execucao",
      autorUsuarioId: "u1",
    });
    const { tabela: cliente } = await grafo.mergeTabela({
      agentId,
      nome: "cliente",
      origem: "validado_execucao",
      autorUsuarioId: "u1",
    });
    await grafo.mergeColuna({
      tabelaId: receber.id,
      nome: "valor",
      tipo: "numeric",
      origem: "validado_execucao",
      autorUsuarioId: "u1",
    });
    await grafo.mergeColuna({
      tabelaId: receber.id,
      nome: "codcli",
      tipo: "int",
      origem: "validado_execucao",
      autorUsuarioId: "u1",
    });
    await grafo.mergeColuna({
      tabelaId: cliente.id,
      nome: "codcli",
      tipo: "int",
      origem: "validado_execucao",
      autorUsuarioId: "u1",
    });
    await grafo.mergeRelacionamento({
      agentId,
      tabelaOrigemId: receber.id,
      colunaOrigem: "codcli",
      tabelaDestinoId: cliente.id,
      colunaDestino: "codcli",
      tipoJoin: "inner",
      origem: "validado_execucao",
      autorUsuarioId: "u1",
    });
    const escopo = parseEscopoSkill({
      tabelas: ["receber", "cliente"],
      colunasPorTabela: { receber: ["valor"], cliente: ["codcli"] },
      relacionamentos: [
        {
          tabelaOrigem: "receber",
          tabelaDestino: "cliente",
          pares: [{ colunaOrigem: "codcli", colunaDestino: "codcli" }],
        },
      ],
    });
    await expect(
      exigirPacotePublicavel(
        grafo,
        agentId,
        escopo,
        "SELECT SUM(r.valor) AS total FROM receber r INNER JOIN cliente c ON r.codcli = c.codcli WHERE r.valor > 0",
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.PERFIL_AUSENTE });
  });
});
