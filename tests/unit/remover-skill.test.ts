import { describe, expect, it } from "vitest";
import { RegistrarAcesso } from "../../src/application/use-cases/cofre.js";
import { CriarSkill, RemoverSkill } from "../../src/application/use-cases/skills.js";
import { ERROR_CODES } from "../../src/domain/errors/error-codes.js";
import { NodeCryptoAdapter } from "../../src/infrastructure/crypto/node-crypto.adapter.js";
import { SetupCodeStore } from "../../src/infrastructure/http/setup-code-store.js";
import {
  InMemoryAprendizadoRepository,
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
const otherAgentId = "22222222-2222-4222-8222-222222222222";

const setup = async () => {
  const plug = new FakePlugServer();
  plug.approve(agentId);
  const usuarios = new InMemoryUsuarioRepository();
  const acessos = new InMemoryAcessoRepository();
  const skills = new InMemorySkillRepository();
  const grafo = new InMemoryGrafoRepository();
  const aprendizado = new InMemoryAprendizadoRepository();
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
  const criar = new CriarSkill(acessos, skills, grafo);
  const remover = new RemoverSkill(acessos, skills, aprendizado);
  const skill = await criar.execute(created.usuarioId, {
    acessoId: created.acessoId,
    slug: "faturamento-periodo",
    nome: "Faturamento no período",
    descricao: "Total faturado a partir de uma data",
    sqlModelo: "SELECT p.codprod AS codigo FROM produto p WHERE p.dtcad >= :dataInicio",
    params: [{ nome: "dataInicio", descricao: "Data inicial do período" }],
  });
  return {
    plug,
    usuarios,
    acessos,
    skills,
    grafo,
    aprendizado,
    registrar,
    criar,
    remover,
    created,
    skill: skill.skill,
  };
};

describe("RemoverSkill", () => {
  it("recusa sem confirmadoPeloUsuario e mostra nome, slug e status", async () => {
    const { remover, created, skill, skills } = await setup();
    await expect(
      remover.execute(created.usuarioId, {
        acessoId: created.acessoId,
        skillId: skill.id,
      }),
    ).rejects.toMatchObject({
      code: ERROR_CODES.VALIDATION_ERROR,
      hint: expect.stringContaining(
        '"Faturamento no período" (slug faturamento-periodo, status rascunho)',
      ),
    });
    expect(await skills.findById(skill.id)).not.toBeNull();
  });

  it("apaga rascunho, libera o slug, desvincula consultas e deixa o grafo", async () => {
    const { remover, criar, created, skill, skills, grafo, aprendizado } = await setup();
    await aprendizado.salvarConsulta({
      agentId,
      skillId: skill.id,
      pergunta: "faturamento no período",
      sql: skill.sqlModelo,
      paramsContrato: skill.params,
      autorUsuarioId: created.usuarioId,
    });
    await aprendizado.registrarSinonimo({
      agentId,
      termo: "faturamento",
      alvoTipo: "skill",
      alvoId: skill.id,
    });
    const result = await remover.execute(created.usuarioId, {
      acessoId: created.acessoId,
      skillId: skill.id,
      confirmadoPeloUsuario: true,
    });
    expect(result).toEqual({
      success: true,
      skillId: skill.id,
      slug: "faturamento-periodo",
      statusAnterior: "rascunho",
    });
    expect(await skills.findById(skill.id)).toBeNull();
    expect(await skills.listByAgent(agentId)).toEqual([]);
    const consultas = await aprendizado.listarConsultas(agentId, 10);
    expect(consultas).toHaveLength(1);
    expect(consultas[0]?.skillId).toBeNull();
    expect(await aprendizado.listarSinonimos(agentId)).toEqual([]);
    expect((await grafo.listTabelas(agentId)).map((tabela) => tabela.nome)).toEqual(["produto"]);
    const again = await criar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      slug: "faturamento-periodo",
      nome: "Faturamento no período",
      descricao: "Total faturado a partir de uma data",
      sqlModelo: "SELECT p.codprod AS codigo FROM produto p WHERE p.dtcad >= :dataInicio",
      params: [{ nome: "dataInicio", descricao: "Data inicial do período" }],
    });
    expect(again.skill.slug).toBe("faturamento-periodo");
  });

  it("apaga skill publicada pelo slug", async () => {
    const { remover, created, skill, skills } = await setup();
    await skills.setStatus(skill.id, "publicada");
    const result = await remover.execute(created.usuarioId, {
      acessoId: created.acessoId,
      slug: skill.slug,
      confirmadoPeloUsuario: true,
    });
    expect(result.statusAnterior).toBe("publicada");
    expect(await skills.listByAgent(agentId)).toEqual([]);
  });

  it("recusa skill de outro agentId", async () => {
    const { plug, registrar, remover, skill, skills } = await setup();
    plug.approve(otherAgentId);
    const other = await registrar.execute({
      email: "c@d.com",
      senha: "secret-pass",
      agentId: otherAgentId,
      dialeto: "sybase",
      clientToken: "tok-sql-other-1",
    });
    await expect(
      remover.execute(other.usuarioId, {
        acessoId: other.acessoId,
        skillId: skill.id,
        confirmadoPeloUsuario: true,
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.SKILL_NOT_FOUND });
    expect(await skills.findById(skill.id)).not.toBeNull();
  });
});
