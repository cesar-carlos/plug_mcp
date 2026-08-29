import { describe, expect, it } from "vitest";
import { RegistrarAcesso } from "../../src/application/use-cases/cofre.js";
import { TreinarComSql } from "../../src/application/use-cases/treinar-com-sql.js";
import {
  AtualizarSkill,
  CriarSkill,
  PublicarSkill,
  ValidarSkill,
} from "../../src/application/use-cases/skills.js";
import { pickSkillInProgress, buildFluxoTreino } from "../../src/application/use-cases/shared/fluxo-treino.js";
import { ERROR_CODES } from "../../src/domain/errors/error-codes.js";
import { NodeCryptoAdapter } from "../../src/infrastructure/crypto/node-crypto.adapter.js";
import { SetupCodeStore } from "../../src/infrastructure/http/setup-code-store.js";
import {
  InMemoryAcessoRepository,
  InMemoryAuditLog,
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
  return { plug, acessos, skills, grafo, created, sessions };
};

const seedTabela = async (
  grafo: InMemoryGrafoRepository,
  usuarioId: string,
  nome = "produto",
  colunas: readonly string[] = ["codprod"],
): Promise<void> => {
  await seedTabelaComColunas(grafo, { agentId, usuarioId, nome, colunas });
};

describe("fluxo guiado de treino", () => {
  it("criar_skill falha se a tabela não está no grafo", async () => {
    const { acessos, skills, grafo, created } = await seed();
    const criar = new CriarSkill(acessos, skills, grafo);
    await expect(
      criar.execute(created.usuarioId, {
        acessoId: created.acessoId,
        nome: "Produtos",
        descricao: "Lista produtos",
        sqlModelo: "SELECT p.codprod AS codigo FROM produto p",
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_ERROR });
  });

  it("validar_skill falha sem descrição dos params", async () => {
    const { plug, acessos, skills, grafo, created, sessions } = await seed();
    await seedTabela(grafo, created.usuarioId);
    const criar = new CriarSkill(acessos, skills, grafo);
    const validar = new ValidarSkill(acessos, skills, plug, sessions, crypto, grafo);
    const createdSkill = await criar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      nome: "Por código",
      descricao: "Filtra produto",
      sqlModelo: "SELECT p.codprod AS codigo FROM produto p WHERE p.codprod = :codigo",
    });
    expect(createdSkill.fluxoTreino.podeLiberar).toBe(false);
    await expect(
      validar.execute(created.usuarioId, {
        acessoId: created.acessoId,
        skillId: createdSkill.skill.id,
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_ERROR });
  });

  it("atualizar_skill recusa SQL com tabela fora do grafo", async () => {
    const { acessos, skills, grafo, created } = await seed();
    await seedTabela(grafo, created.usuarioId);
    const criar = new CriarSkill(acessos, skills, grafo);
    const atualizar = new AtualizarSkill(acessos, skills, grafo);
    const createdSkill = await criar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      nome: "Produtos",
      descricao: "Lista produtos",
      sqlModelo: "SELECT p.codprod AS codigo FROM produto p",
    });
    await expect(
      atualizar.execute(created.usuarioId, {
        acessoId: created.acessoId,
        skillId: createdSkill.skill.id,
        sqlModelo: "SELECT c.codcli AS codigo FROM cliente c",
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_ERROR });
  });

  it("atualizar só params em skill validada mantém validada", async () => {
    const { plug, acessos, skills, grafo, created, sessions } = await seed();
    await seedTabela(grafo, created.usuarioId);
    const criar = new CriarSkill(acessos, skills, grafo);
    const atualizar = new AtualizarSkill(acessos, skills, grafo);
    const validar = new ValidarSkill(acessos, skills, plug, sessions, crypto, grafo);
    const createdSkill = await criar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      nome: "Por código",
      descricao: "Filtra produto",
      sqlModelo: "SELECT p.codprod AS codigo FROM produto p WHERE p.codprod = :codigo",
      params: [{ nome: "codigo", descricao: "Código do produto", tipo: "number" }],
    });
    await validar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      skillId: createdSkill.skill.id,
    });
    const updated = await atualizar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      skillId: createdSkill.skill.id,
      params: [{ nome: "codigo", descricao: "Código interno", tipo: "number" }],
    });
    expect(updated.skill.status).toBe("validada");
  });

  it("atualizar SQL demove para rascunho", async () => {
    const { plug, acessos, skills, grafo, created, sessions } = await seed();
    await seedTabela(grafo, created.usuarioId);
    await seedTabela(grafo, created.usuarioId, "estoque");
    const criar = new CriarSkill(acessos, skills, grafo);
    const atualizar = new AtualizarSkill(acessos, skills, grafo);
    const validar = new ValidarSkill(acessos, skills, plug, sessions, crypto, grafo);
    const createdSkill = await criar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      nome: "Por código",
      descricao: "Filtra produto",
      sqlModelo: "SELECT p.codprod AS codigo FROM produto p WHERE p.codprod = :codigo",
      params: [{ nome: "codigo", descricao: "Código do produto" }],
    });
    await validar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      skillId: createdSkill.skill.id,
    });
    const updated = await atualizar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      skillId: createdSkill.skill.id,
      sqlModelo: "SELECT e.codprod AS codigo FROM estoque e",
    });
    expect(updated.skill.status).toBe("rascunho");
  });

  it("publicar_skill falha sem confirmadoPeloUsuario", async () => {
    const { plug, acessos, skills, grafo, created, sessions } = await seed();
    await seedTabela(grafo, created.usuarioId);
    const criar = new CriarSkill(acessos, skills, grafo);
    const validar = new ValidarSkill(acessos, skills, plug, sessions, crypto, grafo);
    const publicar = new PublicarSkill(acessos, skills, grafo);
    const createdSkill = await criar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      nome: "Por código",
      descricao: "Filtra produto",
      sqlModelo: "SELECT p.codprod AS codigo FROM produto p WHERE p.codprod = :codigo",
      params: [{ nome: "codigo", descricao: "Código do produto" }],
    });
    await validar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      skillId: createdSkill.skill.id,
    });
    await expect(
      publicar.execute(created.usuarioId, {
        acessoId: created.acessoId,
        skillId: createdSkill.skill.id,
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_ERROR });
  });

  it("publica quando o checklist está completo", async () => {
    const { plug, acessos, skills, grafo, created, sessions } = await seed();
    await seedTabela(grafo, created.usuarioId);
    const criar = new CriarSkill(acessos, skills, grafo);
    const validar = new ValidarSkill(acessos, skills, plug, sessions, crypto, grafo);
    const publicar = new PublicarSkill(acessos, skills, grafo);
    const createdSkill = await criar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      nome: "Por código",
      descricao: "Filtra produto",
      sqlModelo: "SELECT p.codprod AS codigo FROM produto p WHERE p.codprod = :codigo",
      params: [{ nome: "codigo", descricao: "Código do produto" }],
    });
    await validar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      skillId: createdSkill.skill.id,
    });
    const published = await publicar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      skillId: createdSkill.skill.id,
      confirmadoPeloUsuario: true,
    });
    expect(published.skill.status).toBe("publicada");
    expect(published.fluxoTreino.podeLiberar).toBe(false);
    expect(published.fluxoTreino.proximoPasso).toBeNull();
  });

  it("treinar com rascunho do mesmo SQL não pede criar_skill de novo", async () => {
    const { plug, acessos, skills, grafo, created, sessions } = await seed();
    await seedTabela(grafo, created.usuarioId);
    const criar = new CriarSkill(acessos, skills, grafo);
    await criar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      nome: "Por código",
      descricao: "Filtra produto",
      sqlModelo: "SELECT p.codprod AS codigo FROM produto p WHERE p.codprod = :codigo",
    });
    const treinar = new TreinarComSql(
      acessos,
      grafo,
      plug,
      sessions,
      crypto,
      new InMemoryAuditLog(),
      skills,
    );
    const trained = await treinar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      sql: "SELECT p.codprod AS codigo FROM produto p WHERE p.codprod = :codigo",
    });
    expect(trained.fluxoTreino.proximoPasso).not.toBe("criar_skill");
  });

  it("pickSkillInProgress prefere SQL igual e depois tabelas do rascunho", () => {
    const base = {
      agentId,
      descricao: "d",
      versao: 1,
      autorUsuarioId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      params: [],
      pacoteVersao: 1,
      motivoRevalidacao: null,
      consultaSemantica: null,
      politicaConsulta: null,
      escopo: {
        tabelas: [],
        colunasPorTabela: {},
        relacionamentos: [],
        graoPorTabela: {},
        graoResultado: [],
        metricasSaida: [],
        pacoteVersao: 1,
      },
    };
    const draftSql = {
      ...base,
      id: "1",
      slug: "a",
      nome: "A",
      sqlModelo: "SELECT p.codprod AS codigo FROM produto p WHERE p.codprod = :codigo",
      status: "rascunho" as const,
    };
    const draftTables = {
      ...base,
      id: "2",
      slug: "b",
      nome: "B",
      sqlModelo: "SELECT p.codprod AS codigo FROM produto p",
      status: "validada" as const,
    };
    expect(pickSkillInProgress([draftTables, draftSql], draftSql.sqlModelo)?.id).toBe("1");
    expect(
      pickSkillInProgress(
        [draftTables],
        "SELECT p.codprod AS codigo, p.descricao FROM produto p WHERE p.codprod = 1",
      )?.id,
    ).toBe("2");
  });

  it("podeLiberar fica falso com perfil incompleto mesmo skill validada", () => {
    const skill = {
      id: "1",
      agentId,
      slug: "a",
      nome: "A",
      descricao: "d",
      sqlModelo: "SELECT SUM(p.valor) AS total FROM produto p WHERE p.codprod > 0",
      params: [],
      versao: 1,
      pacoteVersao: 2,
      motivoRevalidacao: null,
      consultaSemantica: null,
      politicaConsulta: null,
      autorUsuarioId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      status: "validada" as const,
      escopo: {
        tabelas: ["produto"],
        colunasPorTabela: { produto: ["valor"] },
        relacionamentos: [],
        graoPorTabela: {},
        graoResultado: [],
        metricasSaida: [{ alias: "total", expr: "SUM(p.valor)" }],
        pacoteVersao: 2,
      },
    };
    const fluxo = buildFluxoTreino({
      treinado: true,
      skill,
      conflitosPendentes: 0,
      perfilCompleto: false,
    });
    expect(fluxo.podeLiberar).toBe(false);
    expect(fluxo.passos.find((passo) => passo.id === "publicar_skill")?.status).toBe("bloqueado");
  });
});
