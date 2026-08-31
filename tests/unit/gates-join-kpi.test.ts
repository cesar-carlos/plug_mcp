import { describe, expect, it } from "vitest";
import { listarFatosIncompletos } from "../../src/application/use-cases/shared/gates-skill.js";
import { PACOTE_VERSAO_ATUAL } from "../../src/domain/entities/escopo.js";
import { InMemoryGrafoRepository } from "../../src/infrastructure/persistence/memory/memory-cofre.js";

const agentId = "11111111-1111-4111-8111-111111111111";
const usuarioId = "user-1";

describe("gates JOIN isolado e KPI", () => {
  it("composto 1:1 + isolados pede remover_relacionamento, não confirmar o par solto", async () => {
    const grafo = new InMemoryGrafoRepository();
    const filial = await grafo.mergeTabela({
      agentId,
      nome: "Filial",
      origem: "validado_execucao",
      autorUsuarioId: usuarioId,
    });
    const receber = await grafo.mergeTabela({
      agentId,
      nome: "ContaReceber",
      origem: "validado_execucao",
      autorUsuarioId: usuarioId,
    });
    for (const nome of ["CodEmpresa", "CodFilial"] as const) {
      await grafo.mergeColuna({
        tabelaId: filial.tabela.id,
        nome,
        tipo: "int",
        origem: "validado_execucao",
        autorUsuarioId: usuarioId,
      });
      await grafo.mergeColuna({
        tabelaId: receber.tabela.id,
        nome,
        tipo: "int",
        origem: "validado_execucao",
        autorUsuarioId: usuarioId,
      });
    }
    await grafo.mergeColuna({
      tabelaId: receber.tabela.id,
      nome: "SaldoReceber",
      tipo: "numeric",
      papel: "medida",
      origem: "validado_execucao",
      autorUsuarioId: usuarioId,
    });
    await grafo.mergeRelacionamento({
      agentId,
      tabelaOrigemId: filial.tabela.id,
      tabelaDestinoId: receber.tabela.id,
      pares: [{ colunaOrigem: "CodEmpresa", colunaDestino: "CodEmpresa" }],
      tipoJoin: "inner",
      cardinalidade: "1:1",
      origem: "confirmado_usuario",
      autorUsuarioId: usuarioId,
    });
    await grafo.mergeRelacionamento({
      agentId,
      tabelaOrigemId: filial.tabela.id,
      tabelaDestinoId: receber.tabela.id,
      pares: [{ colunaOrigem: "CodFilial", colunaDestino: "CodFilial" }],
      tipoJoin: "inner",
      cardinalidade: "1:1",
      origem: "confirmado_usuario",
      autorUsuarioId: usuarioId,
    });
    await grafo.mergeRelacionamento({
      agentId,
      tabelaOrigemId: filial.tabela.id,
      tabelaDestinoId: receber.tabela.id,
      pares: [
        { colunaOrigem: "CodEmpresa", colunaDestino: "CodEmpresa" },
        { colunaOrigem: "CodFilial", colunaDestino: "CodFilial" },
      ],
      tipoJoin: "inner",
      cardinalidade: "1:1",
      origem: "confirmado_usuario",
      autorUsuarioId: usuarioId,
    });
    const faltas = await listarFatosIncompletos(
      grafo,
      agentId,
      {
        tabelas: ["ContaReceber", "Filial"],
        colunasPorTabela: {
          ContaReceber: ["CodEmpresa", "CodFilial", "SaldoReceber"],
          Filial: ["CodEmpresa", "CodFilial"],
        },
        relacionamentos: [
          {
            tabelaOrigem: "Filial",
            colunaOrigem: "CodEmpresa",
            tabelaDestino: "ContaReceber",
            colunaDestino: "CodEmpresa",
            pares: [{ colunaOrigem: "CodEmpresa", colunaDestino: "CodEmpresa" }],
            tipoJoin: "inner",
            cardinalidade: "1:1",
          },
          {
            tabelaOrigem: "Filial",
            colunaOrigem: "CodFilial",
            tabelaDestino: "ContaReceber",
            colunaDestino: "CodFilial",
            pares: [{ colunaOrigem: "CodFilial", colunaDestino: "CodFilial" }],
            tipoJoin: "inner",
            cardinalidade: "1:1",
          },
          {
            tabelaOrigem: "Filial",
            colunaOrigem: "CodEmpresa",
            tabelaDestino: "ContaReceber",
            colunaDestino: "CodEmpresa",
            pares: [
              { colunaOrigem: "CodEmpresa", colunaDestino: "CodEmpresa" },
              { colunaOrigem: "CodFilial", colunaDestino: "CodFilial" },
            ],
            tipoJoin: "inner",
            cardinalidade: "1:1",
          },
        ],
        graoPorTabela: {},
        graoResultado: [],
        metricasSaida: [{ alias: "SaldoReceber", expr: "SUM(r.SaldoReceber)" }],
        pacoteVersao: PACOTE_VERSAO_ATUAL,
      },
      { exigirCardinalidade: true, exigirTipoColuna: true },
    );
    expect(faltas.some((item) => item.nextAction === "confirmar_relacionamento")).toBe(false);
    expect(faltas.filter((item) => item.nextAction === "remover_relacionamento").length).toBe(2);
    expect(faltas.some((item) => item.kind === "kpi" && item.alvo === "SaldoReceber")).toBe(true);
  });
});
