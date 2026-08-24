import { describe, expect, it } from "vitest";
import { RegistrarAcesso } from "../../src/application/use-cases/cofre.js";
import { CriarSkill, PublicarSkill, ValidarSkill } from "../../src/application/use-cases/skills.js";
import { NodeCryptoAdapter } from "../../src/infrastructure/crypto/node-crypto.adapter.js";
import { SetupCodeStore } from "../../src/infrastructure/http/setup-code-store.js";
import {
  InMemoryAcessoRepository,
  InMemoryGrafoRepository,
  InMemorySkillRepository,
  InMemoryUsuarioRepository,
} from "../../src/infrastructure/persistence/memory/memory-cofre.js";
import { FakePlugServer } from "../helpers/fake-plug-server.js";

const crypto = new NodeCryptoAdapter(
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
);
const agentId = "11111111-1111-4111-8111-111111111111";

describe("ValidarSkill", () => {
  it("valida e publica skill com placeholder :dataInicio", async () => {
    const plug = new FakePlugServer();
    plug.approve(agentId);
    const usuarios = new InMemoryUsuarioRepository();
    const acessos = new InMemoryAcessoRepository();
    const skills = new InMemorySkillRepository();
    const grafo = new InMemoryGrafoRepository();
    const registrar = new RegistrarAcesso(
      usuarios,
      acessos,
      plug,
      crypto,
      new SetupCodeStore(),
      "http://localhost",
      0,
    );
    const created = await registrar.execute({
      email: "a@b.com",
      senha: "secret-pass",
      agentId,
      dialeto: "sybase",
      clientToken: "tok-sql-123456",
    });
    await grafo.mergeTabela({
      agentId,
      nome: "produto",
      origem: "validado_execucao",
      autorUsuarioId: created.usuarioId,
    });
    const sessions = {
      getAccessToken: async () => "access-test",
      invalidate: () => undefined,
    };
    const criar = new CriarSkill(acessos, skills, grafo);
    const validar = new ValidarSkill(acessos, skills, plug, sessions, crypto, grafo);
    const publicar = new PublicarSkill(acessos, skills, grafo);
    const skill = await criar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      slug: "faturamento-periodo",
      nome: "Faturamento no período",
      descricao: "Total faturado a partir de uma data",
      sqlModelo: "SELECT p.codprod AS codigo FROM produto p WHERE p.dtcad >= :dataInicio",
      params: [{ nome: "dataInicio", descricao: "Data inicial do período" }],
    });
    expect(skill.skill.status).toBe("rascunho");
    const validated = await validar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      skillId: skill.skill.id,
    });
    expect(validated.skill.status).toBe("validada");
    expect(plug.lastSql).toMatch(/_validacao/i);
    expect(plug.lastSql).toMatch(/1\s*=\s*0/);
    expect(plug.lastParams).toEqual({ dataInicio: null });
    const published = await publicar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      skillId: skill.skill.id,
      confirmadoPeloUsuario: true,
    });
    expect(published.skill.status).toBe("publicada");
  });

  it("liga params fornecidos na validação", async () => {
    const plug = new FakePlugServer();
    plug.approve(agentId);
    const usuarios = new InMemoryUsuarioRepository();
    const acessos = new InMemoryAcessoRepository();
    const skills = new InMemorySkillRepository();
    const grafo = new InMemoryGrafoRepository();
    const registrar = new RegistrarAcesso(
      usuarios,
      acessos,
      plug,
      crypto,
      new SetupCodeStore(),
      "http://localhost",
      0,
    );
    const created = await registrar.execute({
      email: "a@b.com",
      senha: "secret-pass",
      agentId,
      dialeto: "sybase",
      clientToken: "tok-sql-123456",
    });
    await grafo.mergeTabela({
      agentId,
      nome: "produto",
      origem: "validado_execucao",
      autorUsuarioId: created.usuarioId,
    });
    const sessions = {
      getAccessToken: async () => "access-test",
      invalidate: () => undefined,
    };
    const criar = new CriarSkill(acessos, skills, grafo);
    const validar = new ValidarSkill(acessos, skills, plug, sessions, crypto, grafo);
    const skill = await criar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      nome: "Por código",
      descricao: "Filtra produto por código",
      sqlModelo: "SELECT p.codprod AS codigo FROM produto p WHERE p.codprod = :codigo",
      params: [{ nome: "codigo", descricao: "Código do produto" }],
    });
    await validar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      skillId: skill.skill.id,
      params: { codigo: 42 },
    });
    expect(plug.lastParams).toEqual({ codigo: 42 });
  });
});
