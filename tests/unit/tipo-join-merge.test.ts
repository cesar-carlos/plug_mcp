import { describe, expect, it } from "vitest";
import { decidirMerge, tipoCompativelComPapel } from "../../src/domain/entities/merge-fato.js";
import { relacoesSemSubconjuntos } from "../../src/domain/entities/relacionamento.js";
import { uniaoEscopos, PACOTE_VERSAO_ATUAL } from "../../src/domain/entities/escopo.js";

describe("tipo físico no merge", () => {
  it("substitui uniqueidentifier por datetime2 mesmo com origem mais fraca", () => {
    const result = decidirMerge(
      {
        origem: "validado_execucao",
        status: "vigente",
        descricao: "Data de lançamento",
        dicionario: "lançamento",
        tipo: "uniqueidentifier",
        formato: null,
      },
      {
        origem: "inferido",
        status: "vigente",
        descricao: null,
        tipo: "datetime2",
        formato: "date",
      },
    );
    expect(result.aplicar).toBe(true);
    expect(result.tipo).toBe("datetime2");
    expect(result.formato).toBe("date");
    expect(result.descricao).toBe("Data de lançamento");
    expect(result.dicionario).toBe("lançamento");
    expect(result.origem).toBe("validado_execucao");
    expect(result.conflito).toBe(false);
  });

  it("preenche tipo vazio sem conflito", () => {
    const result = decidirMerge(
      {
        origem: "validado_execucao",
        status: "vigente",
        descricao: null,
        tipo: null,
        formato: null,
      },
      {
        origem: "inferido",
        status: "vigente",
        descricao: null,
        tipo: "int",
        formato: "number",
      },
    );
    expect(result.tipo).toBe("int");
    expect(result.formato).toBe("number");
  });

  it("papel data é incompatível com uuid", () => {
    expect(tipoCompativelComPapel("uniqueidentifier", "data")).toBe(false);
    expect(tipoCompativelComPapel("datetime2", "data")).toBe(true);
  });
});

describe("JOIN composto substitui isolados", () => {
  it("descarta pares isolados que são subconjunto do composto", () => {
    const isoladoEmpresa = {
      tabelaOrigem: "Filial",
      tabelaDestino: "ContaReceber",
      pares: [{ colunaOrigem: "CodEmpresa", colunaDestino: "CodEmpresa" }],
    };
    const isoladoFilial = {
      tabelaOrigem: "Filial",
      tabelaDestino: "ContaReceber",
      pares: [{ colunaOrigem: "CodFilial", colunaDestino: "CodFilial" }],
    };
    const composto = {
      tabelaOrigem: "Filial",
      tabelaDestino: "ContaReceber",
      pares: [
        { colunaOrigem: "CodEmpresa", colunaDestino: "CodEmpresa" },
        { colunaOrigem: "CodFilial", colunaDestino: "CodFilial" },
      ],
    };
    const kept = relacoesSemSubconjuntos([isoladoEmpresa, isoladoFilial, composto]);
    expect(kept).toHaveLength(1);
    expect(kept[0]?.pares).toHaveLength(2);
  });

  it("uniaoEscopos não acumula isolados depois do composto", () => {
    const base = {
      tabelas: ["Filial", "ContaReceber"],
      colunasPorTabela: {
        Filial: ["CodEmpresa", "CodFilial"],
        ContaReceber: ["CodEmpresa", "CodFilial"],
      },
      relacionamentos: [
        {
          tabelaOrigem: "Filial",
          colunaOrigem: "CodEmpresa",
          tabelaDestino: "ContaReceber",
          colunaDestino: "CodEmpresa",
          pares: [{ colunaOrigem: "CodEmpresa", colunaDestino: "CodEmpresa" }],
          tipoJoin: "inner",
        },
        {
          tabelaOrigem: "Filial",
          colunaOrigem: "CodFilial",
          tabelaDestino: "ContaReceber",
          colunaDestino: "CodFilial",
          pares: [{ colunaOrigem: "CodFilial", colunaDestino: "CodFilial" }],
          tipoJoin: "inner",
        },
      ],
      graoPorTabela: {},
      graoResultado: [],
      metricasSaida: [],
      pacoteVersao: PACOTE_VERSAO_ATUAL,
    };
    const extra = {
      ...base,
      relacionamentos: [
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
          cardinalidade: "1:1" as const,
        },
      ],
    };
    const next = uniaoEscopos([base, extra]);
    expect(next.relacionamentos).toHaveLength(1);
    expect(next.relacionamentos[0]?.pares).toHaveLength(2);
    expect(next.relacionamentos[0]?.cardinalidade).toBe("1:1");
  });
});
