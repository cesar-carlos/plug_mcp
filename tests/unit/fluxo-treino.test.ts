import { describe, expect, it } from "vitest";
import { RegistrarAcesso } from "../../src/application/use-cases/cofre.js";
import { TreinarComSql } from "../../src/application/use-cases/treinar-com-sql.js";
import {
  AtualizarSkill,
  CriarSkill,
  PublicarSkill,
  ValidarSkill,
} from "../../src/application/use-cases/skills.js";
import {
  pickSkillInProgress,
  buildFluxoTreino,
  fluxoEFaltasForAgentSkill,
} from "../../src/application/use-cases/shared/fluxo-treino.js";
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

  it("publicar_skill sem confirmação devolve resumo e não publica", async () => {
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
    const preview = await publicar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      skillId: createdSkill.skill.id,
    });
    expect(preview.publicado).toBe(false);
    expect(preview.skill.status).toBe("validada");
    expect(preview.resumoPublicacao.slug).toBe(createdSkill.skill.slug);
    expect(preview.resumoPublicacao.tabelas).toContain("produto");
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
      faltas: [
        {
          kind: "perfil",
          alvo: "produto.valor",
          message: "Coluna produto.valor sem tipo/formato. Chame mapear_tabela.",
          nextAction: "mapear_tabela",
        },
      ],
    });
    expect(fluxo.podeLiberar).toBe(false);
    expect(fluxo.passos.find((passo) => passo.id === "publicar_skill")?.status).toBe("bloqueado");
    expect(fluxo.passoAtual).toBe("publicar_skill");
    expect(fluxo.proximoPasso).toBe("mapear_tabela");
    expect(fluxo.passos.find((passo) => passo.id === "publicar_skill")?.hint).toMatch(
      /mapear_tabela/,
    );
    expect(fluxo.pacoteMinimo).toBe(false);
  });

  it("rascunho_revalidacao pede validar_skill citando motivoRevalidacao", () => {
    const skill = {
      id: "1",
      agentId,
      slug: "a",
      nome: "A",
      descricao: "d",
      sqlModelo: "SELECT p.codprod AS codigo FROM produto p",
      params: [],
      versao: 1,
      pacoteVersao: 2,
      motivoRevalidacao: "SCHEMA_DRIFT em produto",
      consultaSemantica: null,
      politicaConsulta: null,
      autorUsuarioId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      status: "rascunho_revalidacao" as const,
      escopo: {
        tabelas: ["produto"],
        colunasPorTabela: { produto: ["codprod"] },
        relacionamentos: [],
        graoPorTabela: {},
        graoResultado: [],
        metricasSaida: [],
        pacoteVersao: 2,
      },
    };
    const fluxo = buildFluxoTreino({
      treinado: true,
      skill,
      conflitosPendentes: 0,
      perfilCompleto: true,
    });
    expect(fluxo.podeLiberar).toBe(false);
    const validar = fluxo.passos.find((passo) => passo.id === "validar_skill");
    expect(validar?.status).toBe("pendente");
    expect(validar?.hint).toMatch(/SCHEMA_DRIFT em produto/);
    expect(validar?.hint).toMatch(/publicar_skill/);
    expect(fluxo.passos.find((passo) => passo.id === "publicar_skill")?.status).toBe("bloqueado");
    expect(fluxo.passos.find((passo) => passo.id === "publicar_skill")?.hint).toMatch(
      /validar_skill/,
    );
    expect(fluxo.pacoteMinimo).toBe(true);
  });

  it("pacoteMinimo true sem skill; criar_skill pendente cita pacote mínimo", () => {
    const fluxo = buildFluxoTreino({
      treinado: true,
      skill: null,
      conflitosPendentes: 0,
      perfilCompleto: true,
    });
    expect(fluxo.pacoteMinimo).toBe(true);
    expect(fluxo.passos.find((passo) => passo.id === "criar_skill")?.hint).toMatch(/Pacote mínimo/);
  });

  it("CAST de data não desliga pacoteMinimo; SUM sem definição não bloqueia podeLiberar", () => {
    const castOnly = {
      id: "1",
      agentId,
      slug: "a",
      nome: "A",
      descricao: "d",
      sqlModelo: "SELECT CAST(p.dt AS date) AS dataref FROM produto p WHERE p.codprod > 0",
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
        colunasPorTabela: { produto: ["dt"] },
        relacionamentos: [],
        graoPorTabela: {},
        graoResultado: [],
        metricasSaida: [{ alias: "dataref", expr: "CAST(p.dt AS date)" }],
        pacoteVersao: 2,
      },
    };
    expect(
      buildFluxoTreino({
        treinado: true,
        skill: castOnly,
        conflitosPendentes: 0,
        perfilCompleto: true,
      }).pacoteMinimo,
    ).toBe(true);

    const withSum = {
      ...castOnly,
      sqlModelo: "SELECT SUM(p.valor) AS SaldoReceber FROM produto p WHERE p.codprod > 0",
      escopo: {
        ...castOnly.escopo,
        colunasPorTabela: { produto: ["valor"] },
        metricasSaida: [{ alias: "SaldoReceber", expr: "SUM(p.valor)" }],
      },
    };
    const fluxo = buildFluxoTreino({
      treinado: true,
      skill: withSum,
      conflitosPendentes: 0,
      perfilCompleto: true,
      faltas: [
        {
          kind: "kpi" as const,
          alvo: "SaldoReceber",
          message: "Medida SaldoReceber sem definição.",
          nextAction: "atualizar_skill" as const,
        },
      ],
    });
    expect(fluxo.pacoteMinimo).toBe(false);
    expect(fluxo.podeLiberar).toBe(true);
    expect(fluxo.proximoPasso).toBe("publicar_skill");
  });

  it("medida no SELECT detalhe sem overlay não bloqueia podeLiberar", () => {
    const detalhe = {
      id: "1",
      agentId,
      slug: "receber",
      nome: "Receber",
      descricao: "d",
      sqlModelo: "SELECT r.SaldoReceber FROM receber r WHERE r.cod > 0",
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
        tabelas: ["receber"],
        colunasPorTabela: { receber: ["SaldoReceber"] },
        relacionamentos: [],
        graoPorTabela: {},
        graoResultado: [],
        metricasSaida: [],
        pacoteVersao: 2,
      },
    };
    const fluxo = buildFluxoTreino({
      treinado: true,
      skill: detalhe,
      conflitosPendentes: 0,
      perfilCompleto: true,
      faltas: [
        {
          kind: "kpi" as const,
          alvo: "SaldoReceber",
          message: "Medida receber.SaldoReceber sem definição em metricasSaida.",
          nextAction: "atualizar_skill" as const,
        },
      ],
    });
    expect(fluxo.pacoteMinimo).toBe(true);
    expect(fluxo.podeLiberar).toBe(true);
  });

  it("params com tipo default string geram falta kind=param sem bloquear podeLiberar", async () => {
    const { plug, acessos, skills, grafo, created, sessions } = await seed();
    await seedTabela(grafo, created.usuarioId);
    const criar = new CriarSkill(acessos, skills, grafo);
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
    const persisted = await skills.findById(createdSkill.skill.id);
    const { fluxo, faltas } = await fluxoEFaltasForAgentSkill(grafo, agentId, persisted);
    expect(
      faltas.some((falta) => falta.kind === "param" && falta.nextAction === "atualizar_skill"),
    ).toBe(true);
    expect(fluxo.podeLiberar).toBe(true);
  });

  it("treinar_com_sql no Firebird não lança DIALECT_UNSUPPORTED", async () => {
    const plug = new FakePlugServer();
    const fbAgent = "22222222-2222-4222-8222-222222222222";
    plug.approve(fbAgent);
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
      email: "fb@b.com",
      senha: "secret-pass",
      agentId: fbAgent,
      dialeto: "firebird",
      clientToken: "tok-sql-firebird",
    });
    const sessions = {
      getAccessToken: async () => "access-test",
      invalidate: () => undefined,
      remember: () => undefined,
    };
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
      sql: "SELECT p.codprod AS codigo FROM produto p WHERE p.codprod > 0",
    });
    expect(trained.success).toBe(true);
    expect(trained.dialeto).toBe("firebird");
    try {
      await treinar.execute(created.usuarioId, {
        acessoId: created.acessoId,
        sql: "SELECT FIRST 10 p.codprod AS codigo FROM produto p WHERE p.codprod > 0",
      });
      expect.fail("esperava INVALID_SQL no sqlModelo Firebird com FIRST");
    } catch (error) {
      expect(error).toMatchObject({ code: ERROR_CODES.INVALID_SQL });
      expect(error).not.toMatchObject({ code: ERROR_CODES.DIALECT_UNSUPPORTED });
    }
  });
});
