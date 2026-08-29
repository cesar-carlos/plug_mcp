import { describe, expect, it } from "vitest";
import {
  overlayMetricasSaida,
  reaplicarKpiOverlay,
  type EscopoSkill,
} from "../../src/domain/entities/escopo.js";
import { ERROR_CODES } from "../../src/domain/errors/error-codes.js";

const base = (): EscopoSkill => ({
  tabelas: ["produto"],
  colunasPorTabela: { produto: ["valor"] },
  relacionamentos: [],
  graoPorTabela: {},
  graoResultado: [],
  metricasSaida: [{ alias: "total", expr: "SUM(p.valor)" }],
  pacoteVersao: 2,
});

describe("overlayMetricasSaida", () => {
  it("atualiza definição e status só de alias já no pacote", () => {
    const next = overlayMetricasSaida(base(), [
      {
        alias: "total",
        definicao: "Faturamento líquido",
        statusExcluidos: ["C"],
        colunaData: "produto.dtcad",
      },
    ]);
    expect(next.metricasSaida).toEqual([
      {
        alias: "total",
        expr: "SUM(p.valor)",
        definicao: "Faturamento líquido",
        statusExcluidos: ["C"],
        colunaData: "produto.dtcad",
      },
    ]);
  });

  it("recusa alias inventado", () => {
    try {
      overlayMetricasSaida(base(), [{ alias: "ticket", definicao: "x" }]);
      expect.unreachable();
    } catch (err) {
      expect(err).toMatchObject({ code: ERROR_CODES.COLUNA_FORA_DO_ESCOPO });
    }
  });

  it("recusa reescrever a expressão", () => {
    try {
      overlayMetricasSaida(base(), [{ alias: "total", expr: "SUM(p.qtde)" }]);
      expect.unreachable();
    } catch (err) {
      expect(err).toMatchObject({ code: ERROR_CODES.COLUNA_FORA_DO_ESCOPO });
    }
  });

  it("reaplica KPI pelos aliases que ainda existem após o SQL mudar", () => {
    const anterior: EscopoSkill = {
      ...base(),
      metricasSaida: [
        { alias: "total", expr: "SUM(p.valor)", definicao: "Faturamento" },
        { alias: "qtde", expr: "SUM(p.qtde)", definicao: "Itens" },
      ],
    };
    const novo: EscopoSkill = {
      ...base(),
      metricasSaida: [{ alias: "total", expr: "SUM(p.valor * p.qtde)" }],
    };
    const next = reaplicarKpiOverlay(novo, anterior);
    expect(next.metricasSaida).toEqual([
      { alias: "total", expr: "SUM(p.valor * p.qtde)", definicao: "Faturamento" },
    ]);
  });
});
