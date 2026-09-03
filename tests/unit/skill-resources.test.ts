import { describe, expect, it } from "vitest";
import { DIALETOS } from "../../src/domain/entities/dialeto.js";
import { guiaDialeto } from "../../src/application/use-cases/shared/guia-dialeto.js";
import {
  GUIA_PAGINACAO_URI,
  dialetoDoAcesso,
  envelopeSkillResource,
  envelopePersonaResource,
  listPublishedSkillsForUsuario,
  skillToolName,
  urisGuiaDialeto,
  uriPersona,
} from "../../src/infrastructure/mcp/skill-tools.js";
import {
  InMemoryAcessoRepository,
  InMemorySkillRepository,
} from "../../src/infrastructure/persistence/memory/memory-cofre.js";
import { PACOTE_VERSAO_ATUAL, escopoVazio } from "../../src/domain/entities/escopo.js";

describe("resources skill:// e guia://", () => {
  it("lista guias sem skill publicada", () => {
    expect(GUIA_PAGINACAO_URI).toBe("guia://paginacao");
    expect(urisGuiaDialeto()).toEqual(DIALETOS.map((dialeto) => `guia://dialeto/${dialeto}`));
    expect(urisGuiaDialeto()).toContain("guia://dialeto/mssql");
    expect(urisGuiaDialeto()).toContain("guia://dialeto/sybase");
    expect(urisGuiaDialeto()).toContain("guia://dialeto/postgres");
    expect(urisGuiaDialeto()).toContain("guia://dialeto/firebird");
  });

  it("guia de paginação distingue truncated de hasNextPage em cada dialeto", () => {
    for (const dialeto of DIALETOS) {
      const texto = guiaDialeto(dialeto).paginacao;
      expect(texto).toContain("truncated");
      expect(texto).toContain("hasNextPage");
      expect(texto).toMatch(/max_rows/);
    }
  });

  it("skill rascunho não entra na lista publicada", async () => {
    const acessos = new InMemoryAcessoRepository();
    const skills = new InMemorySkillRepository();
    const usuarioId = "u1";
    const agentId = "11111111-1111-4111-8111-111111111111";
    const acesso = await acessos.create({
      usuarioId,
      agentId,
      dialeto: "mssql",
      nomeAmigavel: "t",
      clientTokenEnc: "x",
      clientTokenHash: "y",
      statusAcesso: "approved",
    });
    await skills.create({
      acessoId: acesso.id,
      slug: "rascunho",
      nome: "Rascunho",
      descricao: "nao publicar",
      sqlModelo: "SELECT 1 AS n WHERE 1=1",
      escopo: escopoVazio(),
      autorUsuarioId: usuarioId,
    });
    const published = await listPublishedSkillsForUsuario({ acessos, skills }, usuarioId);
    expect(published).toHaveLength(0);
    const pub = await skills.create({
      acessoId: acesso.id,
      slug: "ok",
      nome: "Ok",
      descricao: "sim",
      sqlModelo: "SELECT 1 AS n WHERE 1=1",
      escopo: { ...escopoVazio(), pacoteVersao: PACOTE_VERSAO_ATUAL },
      autorUsuarioId: usuarioId,
    });
    await skills.setStatus(pub.id, "publicada");
    const listed = await listPublishedSkillsForUsuario({ acessos, skills }, usuarioId);
    expect(listed.map((item) => item.slug)).toEqual(["ok"]);
  });

  it("skill:// usa o dialeto do acesso e omite o guia se não houver acesso", async () => {
    const skills = new InMemorySkillRepository();
    const agentId = "11111111-1111-4111-8111-111111111111";
    const acessoId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const skill = await skills.create({
      acessoId,
      slug: "ok",
      nome: "Ok",
      descricao: "sim",
      sqlModelo: "SELECT 1 AS n WHERE 1=1",
      escopo: { ...escopoVazio(), pacoteVersao: PACOTE_VERSAO_ATUAL },
      autorUsuarioId: "u1",
    });
    expect(dialetoDoAcesso([{ id: acessoId, agentId, dialeto: "mssql" }], acessoId)).toBe("mssql");
    expect(dialetoDoAcesso([], acessoId)).toBeUndefined();

    const comAcesso = envelopeSkillResource(skill, "postgres");
    expect(comAcesso.guiaDialeto?.dialeto).toBe("postgres");
    expect(comAcesso.avisos.map((aviso) => aviso.code)).not.toContain("DIALETO_AUSENTE");

    const semAcesso = envelopeSkillResource(skill, undefined);
    expect(semAcesso.guiaDialeto).toBeUndefined();
    expect(JSON.stringify(semAcesso)).not.toMatch(/"guiaDialeto"/);
    expect(semAcesso.avisos.map((aviso) => aviso.code)).toContain("DIALETO_AUSENTE");
  });

  it("persona:// devolve só nome e instruções do acesso", async () => {
    const acessos = new InMemoryAcessoRepository();
    const usuarioId = "u1";
    const agentId = "11111111-1111-4111-8111-111111111111";
    const acesso = await acessos.create({
      usuarioId,
      agentId,
      dialeto: "mssql",
      nomeAmigavel: "t",
      clientTokenEnc: "x",
      clientTokenHash: "y",
      statusAcesso: "approved",
      nomePersona: "Gestor",
      instrucoesPersona: "Tom executivo.",
    });
    expect(uriPersona(acesso.id)).toBe(`persona://${acesso.id}`);
    expect(envelopePersonaResource(acesso)).toEqual({
      acessoId: acesso.id,
      agentId,
      nomePersona: "Gestor",
      instrucoesPersona: "Tom executivo.",
    });
    expect(JSON.stringify(envelopePersonaResource(acesso))).not.toContain("clientToken");
  });

  it("skill_* N=1 usa só o slug; N>1 sempre sufixa o acessoId", async () => {
    const skills = new InMemorySkillRepository();
    const acessoA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const acessoB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const vendas = await skills.create({
      acessoId: acessoA,
      slug: "vendas",
      nome: "Vendas",
      descricao: "a",
      sqlModelo: "SELECT 1 AS n WHERE 1=1",
      escopo: { ...escopoVazio(), pacoteVersao: PACOTE_VERSAO_ATUAL },
      autorUsuarioId: "u1",
    });
    const estoque = await skills.create({
      acessoId: acessoB,
      slug: "estoque",
      nome: "Estoque",
      descricao: "b",
      sqlModelo: "SELECT 1 AS n WHERE 1=1",
      escopo: { ...escopoVazio(), pacoteVersao: PACOTE_VERSAO_ATUAL },
      autorUsuarioId: "u1",
    });
    expect(skillToolName(vendas, [vendas])).toBe("skill_vendas");
    expect(skillToolName(vendas, [vendas, estoque])).toBe("skill_vendas_aaaaaaaa");
    expect(skillToolName(estoque, [vendas, estoque])).toBe("skill_estoque_bbbbbbbb");
  });
});
