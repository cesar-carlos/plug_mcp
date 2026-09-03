import { describe, expect, it } from "vitest";
import { AtualizarDialeto, RegistrarAcesso } from "../../src/application/use-cases/cofre.js";
import { CriarSkill } from "../../src/application/use-cases/skills.js";
import { ERROR_CODES } from "../../src/domain/errors/error-codes.js";
import { NodeCryptoAdapter } from "../../src/infrastructure/crypto/node-crypto.adapter.js";
import { SetupCodeStore } from "../../src/infrastructure/http/setup-code-store.js";
import {
  InMemoryAcessoRepository,
  InMemoryGrafoRepository,
  InMemorySkillRepository,
  InMemoryUsuarioRepository,
} from "../../src/infrastructure/persistence/memory/memory-cofre.js";
import { FakePlugServer } from "../helpers/fake-plug-server.js";
import { seedTabelaComColunas } from "../helpers/seed-grafo.js";

const crypto = new NodeCryptoAdapter(
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
);
const agentId = "11111111-1111-4111-8111-111111111111";

describe("AtualizarDialeto", () => {
  it("regrava o lock e rebaixa skills publicadas a rascunho", async () => {
    const plug = new FakePlugServer();
    plug.approve(agentId);
    const usuarios = new InMemoryUsuarioRepository();
    const acessos = new InMemoryAcessoRepository();
    const grafo = new InMemoryGrafoRepository();
    const skills = new InMemorySkillRepository();
    const created = await new RegistrarAcesso(
      usuarios,
      acessos,
      plug,
      crypto,
      new SetupCodeStore(),
      "http://localhost",
      0,
    ).execute({
      email: "a@b.com",
      senha: "secret-pass",
      agentId,
      dialeto: "sybase",
      clientToken: "tok-sql-123456",
    });
    await grafo.setDialeto(created.acessoId, "sybase");
    await seedTabelaComColunas(grafo, {
      acessoId: created.acessoId,
      usuarioId: created.usuarioId,
      nome: "produto",
      colunas: ["codprod"],
    });
    const skill = await new CriarSkill(acessos, skills, grafo).execute(created.usuarioId, {
      acessoId: created.acessoId,
      nome: "Produtos",
      descricao: "Lista",
      sqlModelo: "SELECT p.codprod AS codigo FROM produto p",
    });
    await skills.setStatus(skill.skill.id, "publicada");
    const result = await new AtualizarDialeto(acessos, grafo, skills).execute(created.usuarioId, {
      acessoId: created.acessoId,
      dialeto: "mssql",
      confirmadoPeloUsuario: true,
    });
    expect(result.dialetoAnterior).toBe("sybase");
    expect(result.dialeto).toBe("mssql");
    expect(result.skillsRebaixadas).toBe(1);
    expect((await acessos.findById(created.acessoId))?.dialeto).toBe("mssql");
    expect((await grafo.getDialeto(created.acessoId))?.dialeto).toBe("mssql");
    expect((await skills.findById(skill.skill.id))?.status).toBe("rascunho");
  });

  it("recusa sem confirmação", async () => {
    const plug = new FakePlugServer();
    plug.approve(agentId);
    const usuarios = new InMemoryUsuarioRepository();
    const acessos = new InMemoryAcessoRepository();
    const grafo = new InMemoryGrafoRepository();
    const skills = new InMemorySkillRepository();
    const created = await new RegistrarAcesso(
      usuarios,
      acessos,
      plug,
      crypto,
      new SetupCodeStore(),
      "http://localhost",
      0,
    ).execute({
      email: "a@b.com",
      senha: "secret-pass",
      agentId,
      dialeto: "sybase",
      clientToken: "tok-sql-123456",
    });
    await expect(
      new AtualizarDialeto(acessos, grafo, skills).execute(created.usuarioId, {
        acessoId: created.acessoId,
        dialeto: "mssql",
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_ERROR });
  });
});
