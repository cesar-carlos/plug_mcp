import { describe, expect, it } from "vitest";
import { listarFatosIncompletos } from "../../src/application/use-cases/shared/gates-skill.js";
import { PACOTE_VERSAO_ATUAL } from "../../src/domain/entities/escopo.js";
import { InMemoryGrafoRepository } from "../../src/infrastructure/persistence/memory/memory-cofre.js";

const acessoId = "11111111-1111-4111-8111-111111111111";
const usuarioId = "user-1";

describe("gates JOIN isolado e KPI", () => {
  it("composto 1:1 + isolados pede remover_relacionamento, não confirmar o par solto", async () => {
    const grafo = new InMemoryGrafoRepository();
    const filial = await grafo.mergeTabela({
      acessoId: acessoId,
      nome: "Filial",
      origem: "validado_execucao",
      autorUsuarioId: usuarioId,
    });
    const receber = await grafo.mergeTabela({
      acessoId: acessoId,
      nome: "ContaReceber",
      origem: "validado_execucao",
      autorUsuarioId: usuarioId,
    });
    for (const nome of ["CodEmpresa", "CodFilial"] as const) {
      await grafo.mergeColuna({
        acessoId: acessoId,
        tabelaId: filial.tabela.id,
        nome,
        tipo: "int",
        origem: "validado_execucao",
        autorUsuarioId: usuarioId,
      });
      await grafo.mergeColuna({
        acessoId: acessoId,
        tabelaId: receber.tabela.id,
        nome,
        tipo: "int",
        origem: "validado_execucao",
        autorUsuarioId: usuarioId,
      });
    }
    await grafo.mergeColuna({
      acessoId: acessoId,
      tabelaId: receber.tabela.id,
      nome: "SaldoReceber",
      tipo: "numeric",
      papel: "medida",
      origem: "validado_execucao",
      autorUsuarioId: usuarioId,
    });
    await grafo.mergeRelacionamento({
      acessoId: acessoId,
      tabelaOrigemId: filial.tabela.id,
      tabelaDestinoId: receber.tabela.id,
      pares: [{ colunaOrigem: "CodEmpresa", colunaDestino: "CodEmpresa" }],
      tipoJoin: "inner",
      cardinalidade: "1:1",
      origem: "confirmado_usuario",
      autorUsuarioId: usuarioId,
    });
    await grafo.mergeRelacionamento({
      acessoId: acessoId,
      tabelaOrigemId: filial.tabela.id,
      tabelaDestinoId: receber.tabela.id,
      pares: [{ colunaOrigem: "CodFilial", colunaDestino: "CodFilial" }],
      tipoJoin: "inner",
      cardinalidade: "1:1",
      origem: "confirmado_usuario",
      autorUsuarioId: usuarioId,
    });
    await grafo.mergeRelacionamento({
      acessoId: acessoId,
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
      acessoId,
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

  it("coluna papel=medida no pacote sem metricasSaida vira falta kpi sem bloquear CAST", async () => {
    const grafo = new InMemoryGrafoRepository();
    const receber = await grafo.mergeTabela({
      acessoId: acessoId,
      nome: "ContaReceber",
      origem: "validado_execucao",
      autorUsuarioId: usuarioId,
    });
    await grafo.mergeColuna({
      acessoId: acessoId,
      tabelaId: receber.tabela.id,
      nome: "SaldoReceber",
      tipo: "numeric",
      papel: "medida",
      origem: "validado_execucao",
      autorUsuarioId: usuarioId,
    });
    await grafo.mergeColuna({
      acessoId: acessoId,
      tabelaId: receber.tabela.id,
      nome: "Situacao",
      tipo: "char",
      papel: "codigo",
      origem: "validado_execucao",
      autorUsuarioId: usuarioId,
    });
    await grafo.mergeColuna({
      acessoId: acessoId,
      tabelaId: receber.tabela.id,
      nome: "DataEmissao",
      tipo: "datetime",
      papel: "data",
      origem: "validado_execucao",
      autorUsuarioId: usuarioId,
    });
    const faltas = await listarFatosIncompletos(
      grafo,
      acessoId,
      {
        tabelas: ["ContaReceber"],
        colunasPorTabela: {
          ContaReceber: ["SaldoReceber", "Situacao", "DataEmissao"],
        },
        relacionamentos: [],
        graoPorTabela: {},
        graoResultado: [],
        metricasSaida: [],
        pacoteVersao: PACOTE_VERSAO_ATUAL,
      },
      { exigirCardinalidade: false, exigirTipoColuna: false },
    );
    const kpis = faltas.filter((item) => item.kind === "kpi");
    expect(kpis).toHaveLength(1);
    expect(kpis[0]?.alvo).toBe("ContaReceber.SaldoReceber");
    expect(kpis[0]?.nextAction).toBe("atualizar_skill");
    expect(kpis[0]?.message).toMatch(/registrar_aprendizado tipo=metrica/);
    expect(faltas.some((item) => item.alvo.toLowerCase().includes("situacao"))).toBe(false);
  });

  it("duas tabelas com a mesma medida e overlay vazio geram duas faltas kpi", async () => {
    const grafo = new InMemoryGrafoRepository();
    const receber = await grafo.mergeTabela({
      acessoId: acessoId,
      nome: "ContaReceber",
      origem: "validado_execucao",
      autorUsuarioId: usuarioId,
    });
    const pagar = await grafo.mergeTabela({
      acessoId: acessoId,
      nome: "ContaPagar",
      origem: "validado_execucao",
      autorUsuarioId: usuarioId,
    });
    await grafo.mergeColuna({
      acessoId: acessoId,
      tabelaId: receber.tabela.id,
      nome: "SaldoReceber",
      tipo: "numeric",
      papel: "medida",
      origem: "validado_execucao",
      autorUsuarioId: usuarioId,
    });
    await grafo.mergeColuna({
      acessoId: acessoId,
      tabelaId: pagar.tabela.id,
      nome: "SaldoReceber",
      tipo: "numeric",
      papel: "medida",
      origem: "validado_execucao",
      autorUsuarioId: usuarioId,
    });
    const faltas = await listarFatosIncompletos(
      grafo,
      acessoId,
      {
        tabelas: ["ContaReceber", "ContaPagar"],
        colunasPorTabela: {
          ContaReceber: ["SaldoReceber"],
          ContaPagar: ["SaldoReceber"],
        },
        relacionamentos: [],
        graoPorTabela: {},
        graoResultado: [],
        metricasSaida: [],
        pacoteVersao: PACOTE_VERSAO_ATUAL,
      },
      { exigirCardinalidade: false, exigirTipoColuna: false },
    );
    const kpis = faltas.filter((item) => item.kind === "kpi");
    expect(kpis.map((item) => item.alvo).sort()).toEqual([
      "ContaPagar.SaldoReceber",
      "ContaReceber.SaldoReceber",
    ]);
  });

  it("QuantidadeParcelas, NroParc e NumParc não pedem overlay de KPI financeiro", async () => {
    const grafo = new InMemoryGrafoRepository();
    const receber = await grafo.mergeTabela({
      acessoId: acessoId,
      nome: "ContaReceber",
      origem: "validado_execucao",
      autorUsuarioId: usuarioId,
    });
    await grafo.mergeColuna({
      acessoId: acessoId,
      tabelaId: receber.tabela.id,
      nome: "SaldoReceber",
      tipo: "numeric",
      papel: "medida",
      origem: "validado_execucao",
      autorUsuarioId: usuarioId,
    });
    await grafo.mergeColuna({
      acessoId: acessoId,
      tabelaId: receber.tabela.id,
      nome: "Valor",
      tipo: "numeric",
      papel: "medida",
      origem: "validado_execucao",
      autorUsuarioId: usuarioId,
    });
    await grafo.mergeColuna({
      acessoId: acessoId,
      tabelaId: receber.tabela.id,
      nome: "QuantidadeParcelas",
      tipo: "int",
      papel: "medida",
      origem: "validado_execucao",
      autorUsuarioId: usuarioId,
    });
    await grafo.mergeColuna({
      acessoId: acessoId,
      tabelaId: receber.tabela.id,
      nome: "NroParc",
      tipo: "int",
      papel: "medida",
      origem: "validado_execucao",
      autorUsuarioId: usuarioId,
    });
    await grafo.mergeColuna({
      acessoId: acessoId,
      tabelaId: receber.tabela.id,
      nome: "NumParc",
      tipo: "int",
      papel: "medida",
      origem: "validado_execucao",
      autorUsuarioId: usuarioId,
    });
    const faltas = await listarFatosIncompletos(
      grafo,
      acessoId,
      {
        tabelas: ["ContaReceber"],
        colunasPorTabela: {
          ContaReceber: ["SaldoReceber", "Valor", "QuantidadeParcelas", "NroParc", "NumParc"],
        },
        relacionamentos: [],
        graoPorTabela: {},
        graoResultado: [],
        metricasSaida: [],
        pacoteVersao: PACOTE_VERSAO_ATUAL,
      },
      { exigirCardinalidade: false, exigirTipoColuna: false },
    );
    const kpis = faltas.filter((item) => item.kind === "kpi");
    expect(kpis.map((item) => item.alvo).sort()).toEqual([
      "ContaReceber.SaldoReceber",
      "ContaReceber.Valor",
    ]);
  });
});
