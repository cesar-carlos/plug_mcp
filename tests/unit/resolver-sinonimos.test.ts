import { describe, expect, it } from "vitest";
import { PACOTE_VERSAO_ATUAL, escopoVazio } from "../../src/domain/entities/escopo.js";
import type { Skill } from "../../src/domain/entities/skill.js";
import { resolverSkillsPorSinonimos } from "../../src/application/use-cases/shared/resolver-sinonimos.js";

const agora = new Date();

const skillOf = (id: string, slug: string, nome: string): Skill => ({
  id,
  acessoId: "agent",
  slug,
  nome,
  descricao: "Totais",
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

describe("resolverSkillsPorSinonimos", () => {
  const skill = skillOf("uuid-skill", "vendas", "Vendas");

  it("resolve alvoId UUID sem concatenar na query", () => {
    const found = resolverSkillsPorSinonimos(
      "faturamentoabc",
      [
        {
          id: "syn",
          acessoId: "agent",
          termo: "faturamentoabc",
          alvoTipo: "skill",
          alvoId: skill.id,
        },
      ],
      [skill],
    );
    expect(found.map((item) => item.id)).toEqual([skill.id]);
  });

  it("resolve slug e nome", () => {
    const bySlug = resolverSkillsPorSinonimos(
      "faturamentoabc",
      [
        {
          id: "syn",
          acessoId: "agent",
          termo: "faturamentoabc",
          alvoTipo: "skill",
          alvoId: "vendas",
        },
      ],
      [skill],
    );
    expect(bySlug).toHaveLength(1);
    const byNome = resolverSkillsPorSinonimos(
      "faturamentoabc",
      [
        {
          id: "syn2",
          acessoId: "agent",
          termo: "faturamentoabc",
          alvoTipo: "skill",
          alvoId: "Vendas",
        },
      ],
      [skill],
    );
    expect(byNome).toHaveLength(1);
  });

  it("não resolve se o termo não está na query", () => {
    const found = resolverSkillsPorSinonimos(
      "outra pergunta",
      [
        {
          id: "syn",
          acessoId: "agent",
          termo: "faturamentoabc",
          alvoTipo: "skill",
          alvoId: skill.id,
        },
      ],
      [skill],
    );
    expect(found).toHaveLength(0);
  });

  it("casa acento via stripAccents + stem", () => {
    const found = resolverSkillsPorSinonimos(
      "títulos em aberto",
      [
        {
          id: "syn",
          acessoId: "agent",
          termo: "titulo",
          alvoTipo: "skill",
          alvoId: skill.id,
        },
      ],
      [skill],
    );
    expect(found.map((item) => item.id)).toEqual([skill.id]);
  });

  it("termo curto não casa no meio de outra palavra", () => {
    const found = resolverSkillsPorSinonimos(
      "titulo comercial",
      [
        {
          id: "syn",
          acessoId: "agent",
          termo: "tit",
          alvoTipo: "skill",
          alvoId: skill.id,
        },
      ],
      [skill],
    );
    expect(found).toHaveLength(0);
  });
});
