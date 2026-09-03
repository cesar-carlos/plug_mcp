import { describe, expect, it } from "vitest";
import { PACOTE_VERSAO_ATUAL, escopoVazio } from "../../src/domain/entities/escopo.js";
import type { Skill } from "../../src/domain/entities/skill.js";
import {
  coberturaDeSkill,
  comporFatiasBusca,
  haystackCertificado,
} from "../../src/application/use-cases/shared/cobertura-skill.js";
import { stemPortugues } from "../../src/domain/entities/stem-portugues.js";

const agora = new Date();

const skillOf = (extra: Partial<Skill> = {}): Skill => ({
  id: "s1",
  acessoId: "agent",
  slug: "titulos",
  nome: "Títulos",
  descricao: "Saldo de titulo comercial",
  sqlModelo: "SELECT t.codprodunico FROM titulo t",
  params: extra.params ?? [],
  escopo: extra.escopo ?? escopoVazio(),
  versao: 1,
  pacoteVersao: PACOTE_VERSAO_ATUAL,
  status: "publicada",
  motivoRevalidacao: null,
  consultaSemantica: null,
  politicaConsulta: null,
  autorUsuarioId: null,
  createdAt: agora,
  updatedAt: agora,
  ...extra,
});

describe("coberturaDeSkill", () => {
  it("inflexão titulo/titulos completa cobertura por stem", () => {
    const cob = coberturaDeSkill(skillOf(), "titulos");
    expect(cob.cobertura).toBe("completa");
    expect(cob.termosAusentes).toHaveLength(0);
    expect(cob.termosEncontrados).toContain(stemPortugues("titulo"));
  });

  it("token extra na pergunta impede completa (AND)", () => {
    const cob = coberturaDeSkill(skillOf(), "titulos xyzabcnaoexiste");
    expect(cob.cobertura).toBe("parcial");
    expect(cob.termosAusentes.length).toBeGreaterThan(0);
    expect(cob.termosAusentes.some((t) => t.includes("xyz") || t.startsWith("xyz"))).toBe(true);
  });

  it("sqlModelo e corpo de regra não entram no haystack certificado", () => {
    const skill = skillOf({
      sqlModelo: "SELECT p.codprodunico FROM produto p",
    });
    expect(haystackCertificado(skill)).not.toMatch(/codprodunico/i);
    expect(coberturaDeSkill(skill, "codprodunico").cobertura).toBe("desconhecida");
  });

  it("params.tipo não entra no haystack (enum técnico)", () => {
    const skill = skillOf({
      descricao: "Saldo financeiro",
      params: [{ nome: "flag", descricao: "recorte", obrigatorio: true, tipo: "integer" }],
    });
    expect(haystackCertificado(skill)).not.toMatch(/integer/);
    expect(coberturaDeSkill(skill, "integer").cobertura).toBe("desconhecida");
  });

  it("negação na descrição não conta estoque como termo encontrado", () => {
    const skill = skillOf({
      slug: "listagem-de-produtos",
      nome: "Listagem de produtos",
      descricao: "Não agrega estoque e não autoriza cruzar vendas.",
    });
    const cob = coberturaDeSkill(skill, "estoque mínimo do produto");
    expect(cob.termosEncontrados).not.toContain(stemPortugues("estoque"));
    expect(cob.termosEncontrados).toContain(stemPortugues("produto"));
    expect(cob.cobertura).not.toBe("completa");
    expect(haystackCertificado(skill)).not.toMatch(/estoqu/i);
    expect(haystackCertificado(skill)).not.toMatch(/vendas/i);
  });

  it("segunda cláusula de negação não deixa vendas no haystack", () => {
    const skill = skillOf({
      slug: "listagem-de-produtos",
      nome: "Listagem de produtos",
      descricao: "Não agrega estoque e não autoriza cruzar vendas.",
    });
    expect(coberturaDeSkill(skill, "cruzar vendas").termosEncontrados).not.toContain(
      stemPortugues("vendas"),
    );
  });

  it("lista após não autoriza cruzar não casa o segundo termo", () => {
    const skill = skillOf({
      slug: "listagem-de-produtos",
      nome: "Listagem de produtos",
      descricao:
        "Listar produtos ativos. Não agrega estoque e não autoriza cruzar vendas, compras nem títulos.",
    });
    const hay = haystackCertificado(skill);
    expect(hay).not.toMatch(/estoqu/i);
    expect(hay).not.toMatch(/vendas/i);
    expect(hay).not.toMatch(/compras/i);
    expect(hay).not.toMatch(/t[ií]tulos/i);
    expect(hay).toMatch(/produtos/i);
    const visao = coberturaDeSkill(
      skill,
      "visão geral da empresa no mês de julho 2026 vendas faturamento estoque compras fluxo de caixa",
    );
    expect(visao.termosEncontrados).not.toContain(stemPortugues("compras"));
    expect(visao.termosEncontrados).not.toContain(stemPortugues("vendas"));
    expect(visao.termosAusentes).toEqual(
      expect.arrayContaining([stemPortugues("compras"), stemPortugues("estoque")]),
    );
    const estoqueMinimo = coberturaDeSkill(skill, "estoque mínimo do produto");
    expect(estoqueMinimo.termosEncontrados).not.toContain(stemPortugues("estoque"));
    expect(estoqueMinimo.termosEncontrados).toContain(stemPortugues("produto"));
  });

  it("listar produtos ativos continua cobertura completa", () => {
    const skill = skillOf({
      slug: "listagem-de-produtos",
      nome: "Listagem de produtos",
      descricao: "Listar produtos ativos. Não agrega estoque.",
    });
    expect(coberturaDeSkill(skill, "listar produtos ativos").cobertura).toBe("completa");
  });

  it("duas skills publicadas viram cobertura composta, não um cruzamento", () => {
    const vendas = skillOf({
      id: "v",
      slug: "vendas",
      nome: "Vendas",
      descricao: "Vendas do período",
    });
    const receber = skillOf({
      id: "r",
      slug: "titulos-a-receber",
      nome: "Títulos a receber",
      descricao: "Contas a receber",
    });
    const comp = comporFatiasBusca([vendas, receber], "visão geral vendas receber");
    expect(comp.cobertura).toBe("composta");
    expect(comp.consultaPermitida).toBe(true);
    expect(comp.fatias).toHaveLength(2);
    expect(comp.fatias.every((f) => f.consultaPermitida)).toBe(true);
  });

  it("eixos sem skill (estoque/compras) ficam em termosSemSkill na composição", () => {
    const vendas = skillOf({
      id: "v",
      slug: "vendas",
      nome: "Vendas",
      descricao: "Vendas do período",
    });
    const receber = skillOf({
      id: "r",
      slug: "titulos-a-receber",
      nome: "Títulos a receber",
      descricao: "Contas a receber",
    });
    const pagar = skillOf({
      id: "p",
      slug: "titulos-a-pagar",
      nome: "Títulos a pagar",
      descricao: "Contas a pagar",
    });
    const listing = skillOf({
      id: "l",
      slug: "listagem-de-produtos",
      nome: "Listagem de produtos",
      descricao:
        "Listar produtos ativos. Não agrega estoque e não autoriza cruzar vendas, compras nem títulos.",
    });
    const comp = comporFatiasBusca(
      [vendas, receber, pagar, listing],
      "visão geral vendas receber pagar estoque compras",
    );
    expect(comp.cobertura).toBe("composta");
    expect(comp.consultaPermitida).toBe(true);
    expect(comp.termosSemSkill).toEqual(
      expect.arrayContaining([stemPortugues("estoque"), stemPortugues("compras")]),
    );
    expect(comp.fatias.some((f) => f.slug === "listagem-de-produtos")).toBe(false);
  });
});
