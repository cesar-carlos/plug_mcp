import { describe, expect, it } from "vitest";
import { PACOTE_VERSAO_ATUAL, escopoVazio } from "../../src/domain/entities/escopo.js";
import type { AnotacaoGrafo, Skill } from "../../src/domain/entities/skill.js";
import type { TabelaGrafo } from "../../src/domain/entities/grafo.js";
import { CONHECIMENTOS_TETO } from "../../src/domain/entities/conhecimento.js";
import {
  hintRegraParcial,
  montarConhecimentos,
  type FiltroConhecimentos,
} from "../../src/application/use-cases/shared/montar-conhecimentos.js";

const agora = new Date();

const skillOf = (id: string, nome: string, descricao: string): Skill => ({
  id,
  agentId: "agent",
  slug: nome.toLowerCase().replace(/\s+/g, "-"),
  nome,
  descricao,
  sqlModelo: "SELECT 1",
  params: [],
  escopo: escopoVazio(),
  versao: 1,
  pacoteVersao: PACOTE_VERSAO_ATUAL,
  status: "publicada",
  motivoRevalidacao: null,
  consultaSemantica: null,
  politicaConsulta: null,
  autorUsuarioId: null,
  createdAt: agora,
  updatedAt: agora,
});

const notaOf = (id: string, texto: string, extra: Partial<AnotacaoGrafo> = {}): AnotacaoGrafo => ({
  id,
  agentId: "agent",
  tabelaId: extra.tabelaId ?? null,
  skillId: extra.skillId ?? "skill-regra",
  tipo: extra.tipo ?? "regra",
  titulo: extra.titulo ?? "Regra",
  texto,
  autorUsuarioId: null,
  createdAt: agora,
  updatedAt: agora,
});

const tabelaOf = (id: string, nome: string): TabelaGrafo => ({
  id,
  agentId: "agent",
  nome,
  descricao: nome,
  origem: "inferido",
  status: "vigente",
  autorUsuarioId: null,
});

const filtroGap = (extra: Partial<FiltroConhecimentos> = {}): FiltroConhecimentos => ({
  consultaPermitida: false,
  skillIdsPermitidos: new Set(),
  skillIdsCandidatos: extra.skillIdsCandidatos ?? new Set(),
  tabelasPermitidas: extra.tabelasPermitidas ?? new Set(),
  tabelaNomePorId: extra.tabelaNomePorId ?? new Map(),
  ...extra,
});

describe("montarConhecimentos", () => {
  it("mantém nota FTS mesmo sem substring (stem)", () => {
    const hits = montarConhecimentos({
      query: "margens",
      skills: [],
      anotacoes: [notaOf("n1", "calculo da margem comercial")],
      consultas: [],
      tabelas: [],
      filtro: filtroGap({ skillIdsCandidatos: new Set(["skill-regra"]) }),
      skillIdsRecuperados: new Set(),
    });
    expect(hits.some((item) => item.id === "n1" && item.tipo === "regra")).toBe(true);
    expect(hits[0]?.score).toBeGreaterThanOrEqual(1);
  });

  it("não vira card skill se a skill só veio da união e o haystack não bate", () => {
    const hits = montarConhecimentos({
      query: "margens",
      skills: [skillOf("s1", "Contas", "Titulos em aberto")],
      anotacoes: [],
      consultas: [],
      tabelas: [],
      filtro: filtroGap(),
      skillIdsRecuperados: new Set(),
    });
    expect(hits.some((item) => item.tipo === "skill")).toBe(false);
  });

  it("skill recuperada pelo FTS entra com score mínimo 1", () => {
    const hits = montarConhecimentos({
      query: "margens",
      skills: [skillOf("s1", "Contas", "Titulos em aberto")],
      anotacoes: [],
      consultas: [],
      tabelas: [],
      filtro: filtroGap(),
      skillIdsRecuperados: new Set(["s1"]),
    });
    expect(hits).toEqual(
      expect.arrayContaining([expect.objectContaining({ tipo: "skill", id: "s1", score: 1 })]),
    );
  });

  it("reserva 1 slot de regra quando o teto empurraria a evidência para fora", () => {
    const skills = Array.from({ length: CONHECIMENTOS_TETO }, (_, i) =>
      skillOf(`a${i}`, `Alpha ${i}`, "alpha token"),
    );
    const hits = montarConhecimentos({
      query: "alpha",
      skills,
      anotacoes: [notaOf("z-regra", "formula sem o termo da pergunta", { skillId: "s-regra" })],
      consultas: [],
      tabelas: [],
      filtro: filtroGap({ skillIdsCandidatos: new Set(["s-regra"]) }),
      skillIdsRecuperados: new Set(skills.map((item) => item.id)),
      anotacaoIdsRecuperados: new Set(["z-regra"]),
    });
    expect(hits).toHaveLength(CONHECIMENTOS_TETO);
    expect(hits.some((item) => item.tipo === "regra" && item.id === "z-regra")).toBe(true);
  });

  it("omite nota com tabelaId irresolvível", () => {
    const hits = montarConhecimentos({
      query: "segredo",
      skills: [],
      anotacoes: [notaOf("n1", "segredo operacional", { tabelaId: "missing" })],
      consultas: [],
      tabelas: [],
      filtro: filtroGap(),
      skillIdsRecuperados: new Set(),
    });
    expect(hits).toHaveLength(0);
  });

  it("omite nota cuja tabela não está na policy", () => {
    const hits = montarConhecimentos({
      query: "segredo",
      skills: [],
      anotacoes: [notaOf("n1", "segredo operacional", { tabelaId: "t1" })],
      consultas: [],
      tabelas: [tabelaOf("t1", "auditoria")],
      filtro: filtroGap({
        tabelaNomePorId: new Map([["t1", "auditoria"]]),
        tabelasPermitidas: new Set(["produto"]),
      }),
      skillIdsRecuperados: new Set(),
    });
    expect(hits.some((item) => item.id === "n1")).toBe(false);
  });

  it("sinônimo no haystack gera card de skill só-unida", () => {
    const skill = skillOf("s1", "Vendas", "Totais");
    const hits = montarConhecimentos({
      query: "faturamentoabc",
      skills: [skill],
      anotacoes: [],
      consultas: [],
      tabelas: [],
      filtro: filtroGap(),
      skillIdsRecuperados: new Set(),
      sinonimos: [
        {
          id: "syn",
          agentId: "agent",
          termo: "faturamentoabc",
          alvoTipo: "skill",
          alvoId: skill.id,
        },
      ],
    });
    expect(hits.some((item) => item.tipo === "skill" && item.id === "s1")).toBe(true);
  });

  it("reserva 1 slot de métrica com skillId quando o teto está cheio", () => {
    const skills = Array.from({ length: CONHECIMENTOS_TETO }, (_, i) =>
      skillOf(`a${i}`, `Alpha ${i}`, "alpha token"),
    );
    const hits = montarConhecimentos({
      query: "alpha",
      skills,
      anotacoes: [
        notaOf("z-metrica", "formula sem o termo da pergunta", {
          skillId: "s-kpi",
          tipo: "metrica",
          titulo: "KPI",
        }),
      ],
      consultas: [],
      tabelas: [],
      filtro: filtroGap({ skillIdsCandidatos: new Set(["s-kpi"]) }),
      skillIdsRecuperados: new Set(skills.map((item) => item.id)),
      anotacaoIdsRecuperados: new Set(["z-metrica"]),
    });
    expect(hits).toHaveLength(CONHECIMENTOS_TETO);
    expect(hits.some((item) => item.tipo === "metrica" && item.id === "z-metrica")).toBe(true);
  });

  it("omite nota sem tabelaId de skill fora dos candidatos", () => {
    const hits = montarConhecimentos({
      query: "segredo",
      skills: [],
      anotacoes: [notaOf("n1", "segredo operacional", { skillId: "outra-skill" })],
      consultas: [],
      tabelas: [],
      filtro: filtroGap({ skillIdsCandidatos: new Set(["s-ok"]) }),
      skillIdsRecuperados: new Set(),
    });
    expect(hits.some((item) => item.id === "n1")).toBe(false);
  });

  it("ts_rank desempatra hits com o mesmo piso", () => {
    const hits = montarConhecimentos({
      query: "margens",
      skills: [skillOf("s-low", "Contas", "Titulos"), skillOf("s-high", "Contas 2", "Titulos")],
      anotacoes: [],
      consultas: [],
      tabelas: [],
      filtro: filtroGap(),
      skillIdsRecuperados: new Set(["s-low", "s-high"]),
      ranksPorId: new Map([
        ["s-low", 0.1],
        ["s-high", 0.8],
      ]),
    });
    expect(hits[0]?.id).toBe("s-high");
    expect(hits[0]?.score).toBeGreaterThan(hits[1]?.score ?? 0);
  });

  it("omite nota sem recover FTS nem overlap de stem", () => {
    const hits = montarConhecimentos({
      query: "alpha",
      skills: [],
      anotacoes: [notaOf("n-ruido", "formula sem o termo da pergunta")],
      consultas: [],
      tabelas: [],
      filtro: filtroGap({ skillIdsCandidatos: new Set(["skill-regra"]) }),
      skillIdsRecuperados: new Set(),
    });
    expect(hits.some((item) => item.id === "n-ruido")).toBe(false);
  });
});

describe("hintRegraParcial", () => {
  it("cobertura parcial sem anotação ainda pede sinônimo e obter_skill", () => {
    const hint = hintRegraParcial("parcial", [], true, ["faturamentoabcxyz"]);
    expect(hint).toMatch(/obter_skill/);
    expect(hint).toMatch(/sinonimo/);
    expect(hint).toMatch(/faturamentoabcxyz/);
    expect(hintRegraParcial("parcial", [], false)).toBeUndefined();
    expect(hintRegraParcial("completa", [], true)).toBeUndefined();
    expect(hintRegraParcial("desconhecida", [], true)).toBeUndefined();
  });

  it("desconhecida com regra skill-scoped ainda pede obter_skill", () => {
    const hint = hintRegraParcial(
      "desconhecida",
      [
        {
          tipo: "regra",
          id: "n1",
          titulo: "Fórmula",
          trecho: "cashbackxyz",
          fonte: "anotacao",
          skillId: "s1",
          tabelaId: null,
          score: 1,
        },
      ],
      true,
    );
    expect(hint).toMatch(/obter_skill/);
    expect(hint).not.toMatch(/sinonimo/);
    expect(hint).toMatch(/Não cruze skills/);
  });

  it("não ranqueia consulta aprendida genérica numa pergunta de cruzamento", () => {
    const hits = montarConhecimentos({
      query: "Posso cruzar clientes e fornecedores em uma única consulta?",
      skills: [],
      anotacoes: [],
      consultas: [
        {
          id: "c-ruido",
          agentId: "agent",
          skillIds: ["s1"],
          pergunta: "tente fazer a consulta agora, para eu ver se existe erro no servidor",
          sql: "SELECT 1",
          paramsContrato: [],
          execucoes: 1,
          ultimaExecucao: agora,
          status: "ativa",
          autorUsuarioId: null,
        },
      ],
      tabelas: [],
      filtro: filtroGap(),
      skillIdsRecuperados: new Set(),
    });
    expect(hits.some((item) => item.tipo === "consulta_aprendida")).toBe(false);
  });
});
