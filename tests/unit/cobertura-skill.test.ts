import { describe, expect, it } from "vitest";
import { PACOTE_VERSAO_ATUAL, escopoVazio } from "../../src/domain/entities/escopo.js";
import type { Skill } from "../../src/domain/entities/skill.js";
import {
  coberturaDeSkill,
  haystackCertificado,
} from "../../src/application/use-cases/shared/cobertura-skill.js";
import { stemPortugues } from "../../src/domain/entities/stem-portugues.js";

const agora = new Date();

const skillOf = (extra: Partial<Skill> = {}): Skill => ({
  id: "s1",
  agentId: "agent",
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
});
