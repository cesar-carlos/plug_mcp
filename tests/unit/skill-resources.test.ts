import { describe, expect, it } from "vitest";
import { DIALETOS } from "../../src/domain/entities/dialeto.js";
import {
  GUIA_PAGINACAO_URI,
  listPublishedSkillsForUsuario,
  urisGuiaDialeto,
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
  });

  it("skill rascunho não entra na lista publicada", async () => {
    const acessos = new InMemoryAcessoRepository();
    const skills = new InMemorySkillRepository();
    const usuarioId = "u1";
    const agentId = "11111111-1111-4111-8111-111111111111";
    await acessos.create({
      usuarioId,
      agentId,
      dialeto: "mssql",
      nomeAmigavel: "t",
      clientTokenEnc: "x",
      clientTokenHash: "y",
      statusAcesso: "approved",
    });
    await skills.create({
      agentId,
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
      agentId,
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
});
