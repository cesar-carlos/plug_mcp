import { describe, expect, it } from "vitest";
import {
  esqueletoConsultaSemantica,
  esqueletoDaPrimeiraSkillComKpi,
} from "../../src/application/use-cases/shared/esqueleto-semantico.js";
import {
  PACOTE_VERSAO_ATUAL,
  escopoVazio,
  parseEscopoSkill,
} from "../../src/domain/entities/escopo.js";
import type { Skill } from "../../src/domain/entities/skill.js";

const agora = new Date();

const skillOf = (
  escopo: Skill["escopo"],
  consultaSemantica: Skill["consultaSemantica"] = null,
): Skill => ({
  id: "s1",
  agentId: "agent",
  slug: "faturamento",
  nome: "Faturamento",
  descricao: "Total",
  sqlModelo: "SELECT 1",
  params: [],
  escopo,
  versao: 1,
  pacoteVersao: PACOTE_VERSAO_ATUAL,
  status: "publicada",
  motivoRevalidacao: null,
  consultaSemantica,
  politicaConsulta: null,
  autorUsuarioId: null,
  createdAt: agora,
  updatedAt: agora,
});

describe("esqueletoConsultaSemantica", () => {
  it("prefere IR persistido", () => {
    const skill = skillOf(escopoVazio(), {
      versao: 1,
      metrica: "receita",
      dimensoes: ["empresa"],
      periodo: { coluna: "emissao", de: ":de", ate: ":ate" },
    });
    expect(esqueletoConsultaSemantica(skill)).toEqual({
      versao: 1,
      metrica: "receita",
      dimensoes: ["empresa"],
      colunaData: "emissao",
    });
  });

  it("cai no primeiro alias de medida", () => {
    const skill = skillOf(
      parseEscopoSkill({
        metricasSaida: [
          {
            alias: "total",
            expr: "SUM(v.valor)",
            dimensoesPermitidas: ["filial"],
            colunaData: "data",
          },
        ],
      }),
    );
    expect(esqueletoConsultaSemantica(skill)).toEqual({
      versao: 1,
      metrica: "total",
      dimensoes: ["filial"],
      colunaData: "data",
    });
  });

  it("esquece skill sem KPI", () => {
    expect(esqueletoDaPrimeiraSkillComKpi([skillOf(escopoVazio())])).toBeUndefined();
  });

  it("escolhe o alias cujo haystack de KPI tem mais tokens da query", () => {
    const skill = skillOf(
      parseEscopoSkill({
        metricasSaida: [
          { alias: "quantidade", expr: "COUNT(*)", definicao: "volume de itens" },
          {
            alias: "receita",
            expr: "SUM(v.valor)",
            definicao: "faturamento bruto",
            grao: "nota",
          },
        ],
      }),
    );
    expect(esqueletoConsultaSemantica(skill, "faturamento da nota")).toMatchObject({
      metrica: "receita",
    });
  });

  it("empate de overlap prefere IR persistido", () => {
    const skill = skillOf(
      parseEscopoSkill({
        metricasSaida: [
          { alias: "total", expr: "SUM(v.valor)", definicao: "soma" },
          { alias: "receita", expr: "SUM(v.valor)", definicao: "soma" },
        ],
      }),
      { versao: 1, metrica: "receita" },
    );
    expect(esqueletoConsultaSemantica(skill, "xyzinexistente")).toMatchObject({
      metrica: "receita",
    });
  });

  it("entre skills com cobertura completa escolhe o KPI com maior overlap", () => {
    const faturamento = skillOf(
      parseEscopoSkill({
        metricasSaida: [{ alias: "receita", expr: "SUM(v.valor)", definicao: "faturamento" }],
      }),
    );
    const estoque = {
      ...skillOf(
        parseEscopoSkill({
          metricasSaida: [{ alias: "saldo", expr: "SUM(e.qtd)", definicao: "estoque atual" }],
        }),
      ),
      id: "s2",
      slug: "estoque",
      nome: "Estoque",
    };
    expect(
      esqueletoDaPrimeiraSkillComKpi([estoque, faturamento], "faturamento do mes"),
    ).toMatchObject({ metrica: "receita" });
  });

  it("omite CAST de data em pergunta de saldo e não cai no primeiro alias", () => {
    const skill = skillOf(
      parseEscopoSkill({
        metricasSaida: [
          { alias: "DataLancamento", expr: "CAST(cr.DataLancamento AS date)" },
          { alias: "Situacao", expr: "CAST(cr.Situacao AS varchar)" },
        ],
      }),
    );
    expect(esqueletoConsultaSemantica(skill, "Quanto tenho para receber?")).toBeUndefined();
    expect(esqueletoDaPrimeiraSkillComKpi([skill], "Quanto tenho para receber?")).toBeUndefined();
  });

  it("prefere SUM com definição a CAST na mesma skill", () => {
    const skill = skillOf(
      parseEscopoSkill({
        metricasSaida: [
          { alias: "DataLancamento", expr: "CAST(cr.DataLancamento AS date)" },
          {
            alias: "SaldoReceber",
            expr: "SUM(cr.SaldoReceber)",
            definicao: "saldo a receber",
          },
        ],
      }),
    );
    expect(esqueletoConsultaSemantica(skill, "Quanto tenho para receber?")).toMatchObject({
      metrica: "SaldoReceber",
    });
  });
});
