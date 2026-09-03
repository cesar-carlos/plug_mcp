import { describe, expect, it } from "vitest";
import {
  exigirEscopoNoGrafo,
  exigirPacotePublicavel,
} from "../../src/application/use-cases/shared/gates-skill.js";
import { parseEscopoSkill } from "../../src/domain/entities/escopo.js";
import { DomainError } from "../../src/domain/errors/domain-error.js";
import { ERROR_CODES } from "../../src/domain/errors/error-codes.js";
import { InMemoryGrafoRepository } from "../../src/infrastructure/persistence/memory/memory-cofre.js";
import { seedTabelaComColunas } from "../helpers/seed-grafo.js";

const acessoId = "11111111-1111-4111-8111-111111111111";

describe("gate de publicação", () => {
  it("PERFIL_AUSENTE quando métrica existe e a coluna não tem tipo", async () => {
    const grafo = new InMemoryGrafoRepository();
    const { tabela } = await grafo.mergeTabela({
      acessoId: acessoId,
      nome: "receber",
      origem: "validado_execucao",
      autorUsuarioId: null,
    });
    await grafo.mergeColuna({
      acessoId: acessoId,
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
        acessoId,
        escopo,
        "SELECT SUM(r.valor) AS total FROM receber r WHERE r.valor > 0",
      ),
    ).rejects.toMatchObject({
      code: ERROR_CODES.PERFIL_AUSENTE,
      source: "sql",
      details: { faltas: expect.any(Array) },
    });
  });

  it("agregação em uma tabela com tipo publica (pacote mínimo)", async () => {
    const grafo = new InMemoryGrafoRepository();
    await seedTabelaComColunas(grafo, {
      acessoId: acessoId,
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
        acessoId,
        escopo,
        "SELECT SUM(r.valor) AS total FROM receber r WHERE r.valor > 0",
      ),
    ).resolves.toBeUndefined();
  });

  it("JOIN sem cardinalidade bloqueia publicação", async () => {
    const grafo = new InMemoryGrafoRepository();
    const { tabela: receber } = await grafo.mergeTabela({
      acessoId: acessoId,
      nome: "receber",
      origem: "validado_execucao",
      autorUsuarioId: "u1",
    });
    const { tabela: cliente } = await grafo.mergeTabela({
      acessoId: acessoId,
      nome: "cliente",
      origem: "validado_execucao",
      autorUsuarioId: "u1",
    });
    await grafo.mergeColuna({
      acessoId: acessoId,
      tabelaId: receber.id,
      nome: "valor",
      tipo: "numeric",
      origem: "validado_execucao",
      autorUsuarioId: "u1",
    });
    await grafo.mergeColuna({
      acessoId: acessoId,
      tabelaId: receber.id,
      nome: "codcli",
      tipo: "int",
      origem: "validado_execucao",
      autorUsuarioId: "u1",
    });
    await grafo.mergeColuna({
      acessoId: acessoId,
      tabelaId: cliente.id,
      nome: "codcli",
      tipo: "int",
      origem: "validado_execucao",
      autorUsuarioId: "u1",
    });
    await grafo.mergeRelacionamento({
      acessoId: acessoId,
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
        acessoId,
        escopo,
        "SELECT SUM(r.valor) AS total FROM receber r INNER JOIN cliente c ON r.codcli = c.codcli WHERE r.valor > 0",
      ),
    ).rejects.toMatchObject({ code: ERROR_CODES.PERFIL_AUSENTE });
  });

  it("PACOTE_INCOMPLETO nextAction é a primeira falta bloqueante", async () => {
    const grafo = new InMemoryGrafoRepository();
    await seedTabelaComColunas(grafo, {
      acessoId: acessoId,
      usuarioId: "u1",
      nome: "receber",
      colunas: ["valor", "codcli"],
    });
    await seedTabelaComColunas(grafo, {
      acessoId: acessoId,
      usuarioId: "u1",
      nome: "cliente",
      colunas: ["codcli"],
    });
    const escopo = parseEscopoSkill({
      tabelas: ["receber", "cliente"],
      colunasPorTabela: { receber: ["valor", "codcli"], cliente: ["codcli"] },
      relacionamentos: [
        {
          tabelaOrigem: "receber",
          tabelaDestino: "cliente",
          pares: [{ colunaOrigem: "codcli", colunaDestino: "codcli" }],
        },
      ],
    });
    try {
      await exigirEscopoNoGrafo(grafo, acessoId, escopo);
      expect.fail("esperava PACOTE_INCOMPLETO");
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      const domain = error as DomainError;
      expect(domain.code).toBe(ERROR_CODES.PACOTE_INCOMPLETO);
      expect(domain.nextAction).toBe("confirmar_relacionamento");
      const json = domain.toJson();
      expect(json.error.nextAction).toBe("confirmar_relacionamento");
      expect(json.error.nextAction).not.toBe("validar_skill");
    }
  });
});
