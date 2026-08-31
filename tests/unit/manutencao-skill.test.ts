import { describe, expect, it } from "vitest";
import { RegistrarAprendizado } from "../../src/application/use-cases/aprendizado.js";
import { RegistrarAcesso } from "../../src/application/use-cases/cofre.js";
import {
  AtualizarSkill,
  ConfirmarColuna,
  CriarSkill,
  DespublicarSkill,
  ListarSkills,
  PublicarSkill,
  ValidarSkill,
} from "../../src/application/use-cases/skills.js";
import { ERROR_CODES } from "../../src/domain/errors/error-codes.js";
import { NodeCryptoAdapter } from "../../src/infrastructure/crypto/node-crypto.adapter.js";
import { SetupCodeStore } from "../../src/infrastructure/http/setup-code-store.js";
import {
  InMemoryAcessoRepository,
  InMemoryAnotacaoGrafoRepository,
  InMemoryAprendizadoRepository,
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

const seed = async () => {
  const plug = new FakePlugServer();
  plug.approve(agentId);
  const usuarios = new InMemoryUsuarioRepository();
  const acessos = new InMemoryAcessoRepository();
  const skills = new InMemorySkillRepository();
  const grafo = new InMemoryGrafoRepository();
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
  const sessions = {
    getAccessToken: async () => "access-test",
    invalidate: () => undefined,
    remember: () => undefined,
  };
  await seedTabelaComColunas(grafo, {
    agentId,
    usuarioId: created.usuarioId,
    nome: "produto",
    colunas: ["codprod", "valor"],
  });
  return { plug, acessos, skills, grafo, created, sessions };
};

describe("manutenção de skill", () => {
  it("overlay de KPI não rebaixa status e recusa alias inventado", async () => {
    const { plug, acessos, skills, grafo, created, sessions } = await seed();
    const criar = new CriarSkill(acessos, skills, grafo);
    const atualizar = new AtualizarSkill(acessos, skills, grafo);
    const validar = new ValidarSkill(acessos, skills, plug, sessions, crypto, grafo);
    const createdSkill = await criar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      nome: "Faturamento",
      descricao: "Soma valor",
      sqlModelo: "SELECT SUM(p.valor) AS total FROM produto p WHERE p.codprod > 0",
    });
    await validar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      skillId: createdSkill.skill.id,
    });
    const patched = await atualizar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      skillId: createdSkill.skill.id,
      metricasSaida: [{ alias: "total", definicao: "Faturamento líquido", statusExcluidos: ["C"] }],
    });
    expect(patched.skill.status).toBe("validada");
    expect(patched.skill.escopo.metricasSaida[0]).toMatchObject({
      alias: "total",
      definicao: "Faturamento líquido",
      statusExcluidos: ["C"],
    });
    await expect(
      atualizar.execute(created.usuarioId, {
        acessoId: created.acessoId,
        skillId: createdSkill.skill.id,
        metricasSaida: [{ alias: "ticket", definicao: "inventado" }],
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.COLUNA_FORA_DO_ESCOPO });
  });

  it("listar_skills devolve status e fluxoTreino sem sqlModelo", async () => {
    const { acessos, skills, grafo, created } = await seed();
    const criar = new CriarSkill(acessos, skills, grafo);
    await criar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      nome: "Produtos",
      descricao: "Lista",
      sqlModelo: "SELECT p.codprod AS codigo FROM produto p",
    });
    const listed = await new ListarSkills(acessos, skills, grafo).execute(created.usuarioId, {
      acessoId: created.acessoId,
    });
    expect(listed.skills).toHaveLength(1);
    const item = listed.skills[0];
    expect(item).toMatchObject({
      nome: "Produtos",
      status: "rascunho",
      motivoRevalidacao: null,
      podeLiberar: false,
    });
    expect(item?.fluxoTreino.passos.length).toBeGreaterThan(0);
    expect(item).toHaveProperty("faltas");
    expect(item).not.toHaveProperty("sqlModelo");
    expect(item).not.toHaveProperty("escopo");
  });

  it("despublicar_skill rebaixa publicada para validada", async () => {
    const { plug, acessos, skills, grafo, created, sessions } = await seed();
    const criar = new CriarSkill(acessos, skills, grafo);
    const validar = new ValidarSkill(acessos, skills, plug, sessions, crypto, grafo);
    const publicar = new PublicarSkill(acessos, skills, grafo);
    const despublicar = new DespublicarSkill(acessos, skills, grafo);
    const createdSkill = await criar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      nome: "Produtos",
      descricao: "Lista",
      sqlModelo: "SELECT p.codprod AS codigo FROM produto p WHERE p.codprod > 0",
    });
    await validar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      skillId: createdSkill.skill.id,
    });
    await publicar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      skillId: createdSkill.skill.id,
      confirmadoPeloUsuario: true,
    });
    await expect(
      despublicar.execute(created.usuarioId, {
        acessoId: created.acessoId,
        skillId: createdSkill.skill.id,
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_ERROR });
    const result = await despublicar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      skillId: createdSkill.skill.id,
      confirmadoPeloUsuario: true,
    });
    expect(result.skill.status).toBe("validada");
    expect(result.skill.sqlModelo).toContain("codprod");
    expect(result.skill.escopo.tabelas).toContain("produto");
  });

  it("renomear slug exige confirmação e recusa conflito", async () => {
    const { acessos, skills, grafo, created } = await seed();
    const criar = new CriarSkill(acessos, skills, grafo);
    const atualizar = new AtualizarSkill(acessos, skills, grafo);
    const first = await criar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      slug: "produtos",
      nome: "Produtos",
      descricao: "Lista",
      sqlModelo: "SELECT p.codprod AS codigo FROM produto p",
    });
    await criar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      slug: "estoque",
      nome: "Estoque",
      descricao: "Outra",
      sqlModelo: "SELECT p.valor AS valor FROM produto p",
    });
    await expect(
      atualizar.execute(created.usuarioId, {
        acessoId: created.acessoId,
        skillId: first.skill.id,
        slug: "produtos-v2",
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_ERROR });
    await expect(
      atualizar.execute(created.usuarioId, {
        acessoId: created.acessoId,
        skillId: first.skill.id,
        slug: "estoque",
        confirmadoPeloUsuario: true,
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.CONFLICT });
    const renamed = await atualizar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      skillId: first.skill.id,
      slug: "produtos-v2",
      confirmadoPeloUsuario: true,
    });
    expect(renamed.skill.slug).toBe("produtos-v2");
    expect(renamed.skill.status).toBe("rascunho");
  });

  it("confirmar_coluna com skillId entra no pacote e grava sensibilidade confirmada", async () => {
    const { acessos, skills, grafo, created } = await seed();
    const criar = new CriarSkill(acessos, skills, grafo);
    const createdSkill = await criar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      nome: "Produtos",
      descricao: "Lista",
      sqlModelo: "SELECT p.codprod AS codigo FROM produto p",
    });
    const confirmar = new ConfirmarColuna(acessos, grafo, skills);
    await expect(
      confirmar.execute(created.usuarioId, {
        acessoId: created.acessoId,
        tabela: "produto",
        coluna: "valor",
        sensibilidade: "pessoal",
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_ERROR });
    const result = await confirmar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      skillId: createdSkill.skill.id,
      tabela: "produto",
      coluna: "obs",
      descricao: "Observação do cadastro",
      sensibilidade: "pessoal",
      confirmadoPeloUsuario: true,
    });
    expect(result.skill?.escopo.colunasPorTabela.produto).toEqual(
      expect.arrayContaining(["codprod", "obs"]),
    );
    const tabela = await grafo.findTabelaByNome(agentId, "produto");
    const coluna = tabela ? await grafo.findColuna(tabela.id, "obs") : null;
    expect(coluna).toMatchObject({
      sensibilidade: "pessoal",
      origem: "confirmado_usuario",
      descricao: "Observação do cadastro",
    });
    await grafo.mergeColuna({
      tabelaId: tabela!.id,
      nome: "obs",
      tipo: "varchar",
      formato: "text",
      origem: "validado_execucao",
      autorUsuarioId: created.usuarioId,
      sensibilidade: "livre",
    });
    const afterProfile = await grafo.findColuna(tabela!.id, "obs");
    expect(afterProfile?.sensibilidade).toBe("pessoal");
    expect(afterProfile?.origem).toBe("validado_execucao");
    expect(afterProfile?.tipo).toBe("varchar");
  });

  it("confirmar_coluna aceita colunas[] em lote no pacote", async () => {
    const { acessos, skills, grafo, created } = await seed();
    const criar = new CriarSkill(acessos, skills, grafo);
    const createdSkill = await criar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      nome: "Produtos lote",
      descricao: "Lista",
      sqlModelo: "SELECT p.codprod AS codigo FROM produto p",
    });
    const confirmar = new ConfirmarColuna(acessos, grafo, skills);
    const result = await confirmar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      skillId: createdSkill.skill.id,
      colunas: [
        { tabela: "produto", coluna: "nome", descricao: "Nome" },
        { tabela: "produto", coluna: "ativo", descricao: "Ativo" },
      ],
    });
    expect(result.fluxoTreino.passoAtual).toBeTruthy();
    expect(result.skill?.escopo.colunasPorTabela.produto).toEqual(
      expect.arrayContaining(["codprod", "nome", "ativo"]),
    );
  });

  it("registrar_aprendizado tipo=metrica overlay no pacote", async () => {
    const { acessos, skills, grafo, created } = await seed();
    const criar = new CriarSkill(acessos, skills, grafo);
    const createdSkill = await criar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      nome: "Faturamento",
      descricao: "Soma valor",
      sqlModelo: "SELECT SUM(p.valor) AS total FROM produto p WHERE p.codprod > 0",
    });
    const registrar = new RegistrarAprendizado(
      acessos,
      grafo,
      new InMemoryAnotacaoGrafoRepository(),
      new InMemoryAprendizadoRepository(),
      skills,
    );
    await registrar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      skillId: createdSkill.skill.id,
      tipo: "metrica",
      titulo: "total",
      texto: "Faturamento líquido sem cancelados",
    });
    const skill = await skills.findById(createdSkill.skill.id);
    expect(skill?.escopo.metricasSaida[0]?.definicao).toBe("Faturamento líquido sem cancelados");
  });
});
