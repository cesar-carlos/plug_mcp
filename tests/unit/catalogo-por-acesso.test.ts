import { describe, expect, it } from "vitest";
import {
  AdicionarAcesso,
  RegistrarAcesso,
  RemoverAcesso,
} from "../../src/application/use-cases/cofre.js";
import {
  BuscarContexto,
  ConsultarDados,
  ResolverConflito,
} from "../../src/application/use-cases/consultar.js";
import {
  ListarAuditoria,
  RegistrarAprendizado,
} from "../../src/application/use-cases/aprendizado.js";
import {
  AnotarGrafo,
  CriarSkill,
  ListarSkills,
  ObterSkill,
  RemoverAnotacao,
} from "../../src/application/use-cases/skills.js";
import { TreinarComSql } from "../../src/application/use-cases/treinar-com-sql.js";
import { planificarBackfillPorAgente } from "../../src/application/use-cases/shared/backfill-catalogo-acesso.js";
import { DomainError } from "../../src/domain/errors/domain-error.js";
import { ERROR_CODES } from "../../src/domain/errors/error-codes.js";
import { NodeCryptoAdapter } from "../../src/infrastructure/crypto/node-crypto.adapter.js";
import { SetupCodeStore } from "../../src/infrastructure/http/setup-code-store.js";
import {
  InMemoryAcessoRepository,
  InMemoryAnotacaoGrafoRepository,
  InMemoryAprendizadoRepository,
  InMemoryAuditLog,
  InMemoryGrafoRepository,
  InMemorySkillRepository,
  InMemoryUsuarioRepository,
} from "../../src/infrastructure/persistence/memory/memory-cofre.js";
import { FakePlugServer } from "../helpers/fake-plug-server.js";
import { seedTabelaComColunas } from "../helpers/seed-grafo.js";
import { stubSessions } from "../helpers/stub-sessions.js";
import { asAcessoId } from "../../src/infrastructure/persistence/as-acesso-id.js";
import { listPublishedSkillsForUsuario } from "../../src/infrastructure/mcp/skill-tools.js";
import { requireSkillDoAcesso } from "../../src/application/use-cases/shared/skill-do-acesso.js";

const crypto = new NodeCryptoAdapter(
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
);
const agentId = "11111111-1111-4111-8111-111111111111";

const repos = () => {
  const plug = new FakePlugServer();
  plug.approve(agentId);
  return {
    plug,
    usuarios: new InMemoryUsuarioRepository(),
    acessos: new InMemoryAcessoRepository(),
    skills: new InMemorySkillRepository(),
    grafo: new InMemoryGrafoRepository(),
    anotacoes: new InMemoryAnotacaoGrafoRepository(),
    aprendizado: new InMemoryAprendizadoRepository(),
    audit: new InMemoryAuditLog(),
  };
};

const registrar = async (
  ctx: ReturnType<typeof repos>,
  email: string,
  clientToken: string,
): Promise<{ usuarioId: string; acessoId: string }> => {
  const created = await new RegistrarAcesso(
    ctx.usuarios,
    ctx.acessos,
    ctx.plug,
    crypto,
    new SetupCodeStore(),
    "http://localhost",
    0,
  ).execute({
    email,
    senha: "secret-pass",
    agentId,
    dialeto: "mssql",
    clientToken,
  });
  return { usuarioId: created.usuarioId, acessoId: created.acessoId };
};

const treinarECriar = async (
  ctx: ReturnType<typeof repos>,
  usuarioId: string,
  acessoId: string | undefined,
  nome: string,
): Promise<string> => {
  const sessions = stubSessions();
  await new TreinarComSql(
    ctx.acessos,
    ctx.grafo,
    ctx.plug,
    sessions,
    crypto,
    ctx.audit,
    ctx.skills,
  ).execute(usuarioId, {
    ...(acessoId != null ? { acessoId } : {}),
    sql: "SELECT p.codprod AS codigo FROM produto p WHERE p.codprod > 0",
  });
  const created = await new CriarSkill(ctx.acessos, ctx.skills, ctx.grafo).execute(usuarioId, {
    ...(acessoId != null ? { acessoId } : {}),
    nome,
    descricao: "Produtos do catalogo",
    sqlModelo: "SELECT p.codprod AS codigo FROM produto p WHERE p.codprod > 0",
  });
  return created.skill.id;
};

describe("catálogo isolado por acesso (client_token)", () => {
  it("dois usuarios com o mesmo agentId não veem a skill um do outro", async () => {
    const ctx = repos();
    const a = await registrar(ctx, "a@b.com", "tok-user-a-123456");
    const b = await registrar(ctx, "c@d.com", "tok-user-b-123456");
    await seedTabelaComColunas(ctx.grafo, {
      acessoId: a.acessoId,
      usuarioId: a.usuarioId,
      nome: "produto",
      colunas: ["codprod"],
    });
    const skillId = await treinarECriar(ctx, a.usuarioId, a.acessoId, "Produtos A");

    const listar = new ListarSkills(ctx.acessos, ctx.skills, ctx.grafo);
    const listedB = await listar.execute(b.usuarioId, { acessoId: b.acessoId });
    expect(listedB.skills).toHaveLength(0);

    await expect(listar.execute(b.usuarioId, { acessoId: a.acessoId })).rejects.toMatchObject({
      code: ERROR_CODES.ACESSO_NOT_FOUND,
    });

    const obter = new ObterSkill(
      ctx.acessos,
      ctx.skills,
      ctx.grafo,
      ctx.anotacoes,
      ctx.plug,
      stubSessions(),
      crypto,
    );
    await expect(
      obter.execute(b.usuarioId, { acessoId: b.acessoId, skillId }),
    ).rejects.toBeInstanceOf(DomainError);

    const publishedB = await listPublishedSkillsForUsuario(
      { acessos: ctx.acessos, skills: ctx.skills },
      b.usuarioId,
    );
    expect(publishedB).toHaveLength(0);
  });

  it("mesmo usuario e agentId, dois client_tokens: skill do acesso A é invisível no B", async () => {
    const ctx = repos();
    const a = await registrar(ctx, "mesmo@b.com", "tok-persona-a-111");
    const added = await new AdicionarAcesso(ctx.acessos, ctx.plug, stubSessions(), crypto).execute(
      a.usuarioId,
      { agentId, dialeto: "mssql", clientToken: "tok-persona-b-222" },
    );
    const acessoB = added.acesso.id;

    await seedTabelaComColunas(ctx.grafo, {
      acessoId: a.acessoId,
      usuarioId: a.usuarioId,
      nome: "produto",
      colunas: ["codprod"],
    });
    const skillId = await treinarECriar(ctx, a.usuarioId, a.acessoId, "Produtos A");
    await ctx.skills.setStatus(skillId, "publicada");

    const listar = new ListarSkills(ctx.acessos, ctx.skills, ctx.grafo);
    const listedA = await listar.execute(a.usuarioId, { acessoId: a.acessoId });
    expect(listedA.skills.map((item) => item.slug)).toContain("produtos-a");

    const listedB = await listar.execute(a.usuarioId, { acessoId: acessoB });
    expect(listedB.skills).toHaveLength(0);
    expect(listedB.skills.some((item) => item.id === skillId)).toBe(false);

    const tabelasB = await ctx.grafo.listTabelas(acessoB);
    expect(tabelasB).toHaveLength(0);

    const obter = new ObterSkill(
      ctx.acessos,
      ctx.skills,
      ctx.grafo,
      ctx.anotacoes,
      ctx.plug,
      stubSessions(),
      crypto,
    );
    await expect(obter.execute(a.usuarioId, { acessoId: acessoB, skillId })).rejects.toMatchObject({
      code: ERROR_CODES.SKILL_NOT_FOUND,
    });

    const published = await listPublishedSkillsForUsuario(
      { acessos: ctx.acessos, skills: ctx.skills },
      a.usuarioId,
    );
    expect(published.map((item) => item.acessoId)).toEqual([a.acessoId]);
    expect(published[0]?.slug).toBe("produtos-a");
  });

  it("N=1: tool de treino sem acessoId amarra no único acesso", async () => {
    const ctx = repos();
    const only = await registrar(ctx, "unico@b.com", "tok-unico-123456");
    await seedTabelaComColunas(ctx.grafo, {
      acessoId: only.acessoId,
      usuarioId: only.usuarioId,
      nome: "produto",
      colunas: ["codprod"],
    });
    const skillId = await treinarECriar(ctx, only.usuarioId, undefined, "Unico");
    const skill = await ctx.skills.findById(skillId);
    expect(skill?.acessoId).toBe(only.acessoId);

    const listed = await new ListarSkills(ctx.acessos, ctx.skills, ctx.grafo).execute(
      only.usuarioId,
      {},
    );
    expect(listed.skills).toHaveLength(1);
    expect(listed.skills[0]?.id).toBe(skillId);
  });

  it("N>1: omitir acessoId recusa em vez de misturar catálogos", async () => {
    const ctx = repos();
    const a = await registrar(ctx, "n@b.com", "tok-n1-123456");
    await new AdicionarAcesso(ctx.acessos, ctx.plug, stubSessions(), crypto).execute(a.usuarioId, {
      agentId,
      dialeto: "mssql",
      clientToken: "tok-n2-123456",
    });
    await expect(
      new ListarSkills(ctx.acessos, ctx.skills, ctx.grafo).execute(a.usuarioId, {}),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_ERROR });
  });

  it("omitir skillIds em consultar_dados / buscar_contexto não une o outro acesso", async () => {
    const ctx = repos();
    const a = await registrar(ctx, "omit@b.com", "tok-omit-a-1111");
    const added = await new AdicionarAcesso(ctx.acessos, ctx.plug, stubSessions(), crypto).execute(
      a.usuarioId,
      { agentId, dialeto: "mssql", clientToken: "tok-omit-b-2222" },
    );
    const acessoB = added.acesso.id;
    await seedTabelaComColunas(ctx.grafo, {
      acessoId: a.acessoId,
      usuarioId: a.usuarioId,
      nome: "produto",
      colunas: ["codprod"],
    });
    const skillId = await treinarECriar(ctx, a.usuarioId, a.acessoId, "Produtos A");
    await ctx.skills.setStatus(skillId, "publicada");

    const sessions = stubSessions();
    const consultar = new ConsultarDados(
      ctx.acessos,
      ctx.skills,
      ctx.plug,
      sessions,
      crypto,
      ctx.audit,
      500,
      5000,
    );
    await expect(
      consultar.execute(a.usuarioId, { acessoId: acessoB, pergunta: "lista de produtos" }),
    ).rejects.toMatchObject({ code: ERROR_CODES.SKILL_GAP });

    const buscar = new BuscarContexto(
      ctx.acessos,
      ctx.grafo,
      ctx.skills,
      ctx.anotacoes,
      ctx.plug,
      sessions,
      crypto,
      ctx.aprendizado,
      ctx.audit,
    );
    const ctxB = await buscar.execute(a.usuarioId, { acessoId: acessoB, query: "produtos" });
    expect(ctxB.skillsPublicadas).toHaveLength(0);
    expect(ctxB.candidatos).toHaveLength(0);
    expect(ctxB.consultaPermitida).toBe(false);
  });

  it("resolver_conflito e remover_anotacao não mutam o outro catálogo", async () => {
    const ctx = repos();
    const a = await registrar(ctx, "idor@b.com", "tok-idor-a-1111");
    const added = await new AdicionarAcesso(ctx.acessos, ctx.plug, stubSessions(), crypto).execute(
      a.usuarioId,
      { agentId, dialeto: "mssql", clientToken: "tok-idor-b-2222" },
    );
    const acessoB = added.acesso.id;
    await seedTabelaComColunas(ctx.grafo, {
      acessoId: a.acessoId,
      usuarioId: a.usuarioId,
      nome: "produto",
      colunas: ["codprod"],
    });
    const tabelaA = await ctx.grafo.findTabelaByNome(a.acessoId, "produto");
    const colunasA = await ctx.grafo.listColunas(a.acessoId, tabelaA!.id);
    await ctx.grafo.mergeColuna({
      acessoId: a.acessoId,
      tabelaId: tabelaA!.id,
      nome: "codprod",
      descricao: "outro significado",
      origem: "confirmado_usuario",
      autorUsuarioId: a.usuarioId,
    });

    await expect(
      new ResolverConflito(ctx.acessos, ctx.grafo).execute(a.usuarioId, {
        acessoId: acessoB,
        tabelaId: tabelaA!.id,
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_ERROR });
    await expect(
      new ResolverConflito(ctx.acessos, ctx.grafo).execute(a.usuarioId, {
        acessoId: acessoB,
        colunaId: colunasA[0]!.id,
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_ERROR });

    const nota = await ctx.anotacoes.create({
      acessoId: a.acessoId,
      tabelaId: tabelaA!.id,
      tipo: "regra",
      titulo: "Regra A",
      texto: "Só no catálogo A",
      autorUsuarioId: a.usuarioId,
    });
    await expect(
      new RemoverAnotacao(ctx.acessos, ctx.anotacoes).execute(a.usuarioId, {
        acessoId: acessoB,
        anotacaoId: nota.id,
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.ANOTACAO_NOT_FOUND });
    expect(await ctx.anotacoes.findById(nota.id)).not.toBeNull();
  });

  it("órfão (acesso_id NULL) não colapsa no tenant vazio", async () => {
    expect(asAcessoId(null)).toBeNull();
    expect(asAcessoId("")).toBeNull();
    expect(asAcessoId("acc-1")).toBe("acc-1");

    const skills = new InMemorySkillRepository();
    const orphan = await skills.create({
      acessoId: null as unknown as string,
      slug: "orfao",
      nome: "Orfao",
      descricao: "cutover sem acesso",
      sqlModelo: "SELECT 1 AS n WHERE 1=1",
      autorUsuarioId: null,
    });
    expect(orphan.acessoId).toBeNull();
    expect(await skills.listByAcesso("")).toHaveLength(0);
    expect(await skills.listByAcesso("acc-1")).toHaveLength(0);
    expect((await skills.findById(orphan.id))?.acessoId).toBeNull();
  });

  it("anotar_grafo recusa skillId de outro acesso", async () => {
    const ctx = repos();
    const a = await registrar(ctx, "nota@b.com", "tok-nota-a-1111");
    const added = await new AdicionarAcesso(ctx.acessos, ctx.plug, stubSessions(), crypto).execute(
      a.usuarioId,
      { agentId, dialeto: "mssql", clientToken: "tok-nota-b-2222" },
    );
    const acessoB = added.acesso.id;
    await seedTabelaComColunas(ctx.grafo, {
      acessoId: a.acessoId,
      usuarioId: a.usuarioId,
      nome: "produto",
      colunas: ["codprod"],
    });
    const skillId = await treinarECriar(ctx, a.usuarioId, a.acessoId, "Produtos A");
    const anotar = new AnotarGrafo(ctx.acessos, ctx.grafo, ctx.anotacoes, ctx.skills);
    await expect(
      anotar.execute(a.usuarioId, {
        acessoId: acessoB,
        skillId,
        tipo: "regra",
        titulo: "Regra B",
        texto: "Não aponte para a skill do outro token",
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.SKILL_NOT_FOUND });
    expect(await ctx.anotacoes.list(acessoB)).toHaveLength(0);
  });

  it("aprendizado e sinônimo recusam skillId/alvoId de outro acesso", async () => {
    const ctx = repos();
    const a = await registrar(ctx, "apr@b.com", "tok-apr-a-1111");
    const added = await new AdicionarAcesso(ctx.acessos, ctx.plug, stubSessions(), crypto).execute(
      a.usuarioId,
      { agentId, dialeto: "mssql", clientToken: "tok-apr-b-2222" },
    );
    const acessoB = added.acesso.id;
    await seedTabelaComColunas(ctx.grafo, {
      acessoId: a.acessoId,
      usuarioId: a.usuarioId,
      nome: "produto",
      colunas: ["codprod"],
    });
    const skillId = await treinarECriar(ctx, a.usuarioId, a.acessoId, "Produtos A");
    const registrarApr = new RegistrarAprendizado(
      ctx.acessos,
      ctx.grafo,
      ctx.anotacoes,
      ctx.aprendizado,
      ctx.skills,
    );
    await expect(
      registrarApr.execute(a.usuarioId, {
        acessoId: acessoB,
        skillId,
        tipo: "regra",
        titulo: "Regra B",
        texto: "Não grave ponteiro sujo",
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.SKILL_NOT_FOUND });
    await expect(
      registrarApr.execute(a.usuarioId, {
        acessoId: acessoB,
        skillId,
        tipo: "sinonimo",
        titulo: "itens",
        texto: "produtos",
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.SKILL_NOT_FOUND });
    expect(await ctx.anotacoes.list(acessoB)).toHaveLength(0);
    expect(await ctx.aprendizado.listarSinonimos(acessoB)).toHaveLength(0);
  });

  it("cutover 0022: um acesso anexa, vários duplicam, zero fica órfão", () => {
    expect(planificarBackfillPorAgente(agentId, [])).toEqual({
      agentId,
      canonicalAcessoId: null,
      duplicarPara: [],
      orfao: true,
    });
    expect(planificarBackfillPorAgente(agentId, ["acc-1"])).toEqual({
      agentId,
      canonicalAcessoId: "acc-1",
      duplicarPara: [],
      orfao: false,
    });
    expect(planificarBackfillPorAgente(agentId, ["acc-1", "acc-2", "acc-2"])).toEqual({
      agentId,
      canonicalAcessoId: "acc-1",
      duplicarPara: ["acc-2"],
      orfao: false,
    });
  });

  it("remover_acesso CASCADE esvazia o catálogo in-memory daquele acesso", async () => {
    const ctx = repos();
    const a = await registrar(ctx, "casc@b.com", "tok-casc-a-1111");
    await seedTabelaComColunas(ctx.grafo, {
      acessoId: a.acessoId,
      usuarioId: a.usuarioId,
      nome: "produto",
      colunas: ["codprod"],
    });
    const skillId = await treinarECriar(ctx, a.usuarioId, a.acessoId, "Produtos A");
    await ctx.grafo.setDialeto(a.acessoId, "mssql");
    await ctx.grafo.saveSchemaSnapshot({
      acessoId: a.acessoId,
      tabelaNome: "produto",
      assinatura: "v1",
    });
    await ctx.anotacoes.create({
      acessoId: a.acessoId,
      tabelaId: null,
      skillId,
      tipo: "regra",
      titulo: "Regra",
      texto: "Só neste acesso",
      autorUsuarioId: a.usuarioId,
    });
    await ctx.aprendizado.salvarConsulta({
      acessoId: a.acessoId,
      skillIds: [skillId],
      pergunta: "lista produtos",
      sql: "SELECT p.codprod AS codigo FROM produto p WHERE p.codprod > 0",
      paramsContrato: [],
      autorUsuarioId: a.usuarioId,
    });
    await ctx.aprendizado.registrarSinonimo({
      acessoId: a.acessoId,
      termo: "item",
      alvoTipo: "skill",
      alvoId: skillId,
    });
    await ctx.aprendizado.registrarLacuna(a.acessoId, "falta estoque", "skill_gap");

    await new RemoverAcesso(ctx.acessos, {
      grafo: ctx.grafo,
      skills: ctx.skills,
      anotacoes: ctx.anotacoes,
      aprendizado: ctx.aprendizado,
    }).execute(a.usuarioId, { acessoId: a.acessoId });

    expect(await ctx.skills.listByAcesso(a.acessoId)).toHaveLength(0);
    expect(await ctx.grafo.listTabelas(a.acessoId)).toHaveLength(0);
    expect(await ctx.grafo.getDialeto(a.acessoId)).toBeNull();
    expect(await ctx.grafo.listSchemaSnapshots(a.acessoId)).toHaveLength(0);
    expect(await ctx.anotacoes.list(a.acessoId)).toHaveLength(0);
    expect(await ctx.aprendizado.listarConsultas(a.acessoId, 10)).toHaveLength(0);
    expect(await ctx.aprendizado.listarSinonimos(a.acessoId)).toHaveLength(0);
    expect(await ctx.aprendizado.listarLacunas(a.acessoId, 10)).toHaveLength(0);
    await expect(requireSkillDoAcesso(ctx.skills, skillId, a.acessoId)).rejects.toMatchObject({
      code: ERROR_CODES.SKILL_NOT_FOUND,
    });
  });

  it("N>1: skillId único amarra o acesso; slug ambíguo ou omitido recusa", async () => {
    const ctx = repos();
    const a = await registrar(ctx, "bind@b.com", "tok-bind-a-1111");
    const added = await new AdicionarAcesso(ctx.acessos, ctx.plug, stubSessions(), crypto).execute(
      a.usuarioId,
      { agentId, dialeto: "mssql", clientToken: "tok-bind-b-2222" },
    );
    const acessoB = added.acesso.id;
    await seedTabelaComColunas(ctx.grafo, {
      acessoId: a.acessoId,
      usuarioId: a.usuarioId,
      nome: "produto",
      colunas: ["codprod"],
    });
    await seedTabelaComColunas(ctx.grafo, {
      acessoId: acessoB,
      usuarioId: a.usuarioId,
      nome: "produto",
      colunas: ["codprod"],
    });
    const skillA = await treinarECriar(ctx, a.usuarioId, a.acessoId, "Produtos");
    await treinarECriar(ctx, a.usuarioId, acessoB, "Outros");
    await ctx.skills.setStatus(skillA, "publicada");

    const obter = new ObterSkill(
      ctx.acessos,
      ctx.skills,
      ctx.grafo,
      ctx.anotacoes,
      ctx.plug,
      stubSessions(),
      crypto,
    );
    const boundId = await obter.execute(a.usuarioId, { skillId: skillA });
    expect(boundId.skill.acessoId).toBe(a.acessoId);
    const boundSlug = await obter.execute(a.usuarioId, { slug: "produtos" });
    expect(boundSlug.skill.id).toBe(skillA);

    const consultar = new ConsultarDados(
      ctx.acessos,
      ctx.skills,
      ctx.plug,
      stubSessions(),
      crypto,
      ctx.audit,
      500,
      5000,
    );
    const viaSkillTool = await consultar.execute(a.usuarioId, {
      skillId: skillA,
      pergunta: "lista de produtos",
    });
    expect(viaSkillTool.skillId).toBe(skillA);

    await treinarECriar(ctx, a.usuarioId, acessoB, "Produtos");
    await expect(obter.execute(a.usuarioId, { slug: "produtos" })).rejects.toMatchObject({
      code: ERROR_CODES.VALIDATION_ERROR,
    });
    await expect(obter.execute(a.usuarioId, {})).rejects.toMatchObject({
      code: ERROR_CODES.VALIDATION_ERROR,
    });
  });

  it("consultaAprendidaId do acesso A não executa no B", async () => {
    const ctx = repos();
    const a = await registrar(ctx, "aprq@b.com", "tok-aprq-a-1111");
    const added = await new AdicionarAcesso(ctx.acessos, ctx.plug, stubSessions(), crypto).execute(
      a.usuarioId,
      { agentId, dialeto: "mssql", clientToken: "tok-aprq-b-2222" },
    );
    const acessoB = added.acesso.id;
    await seedTabelaComColunas(ctx.grafo, {
      acessoId: a.acessoId,
      usuarioId: a.usuarioId,
      nome: "produto",
      colunas: ["codprod"],
    });
    await seedTabelaComColunas(ctx.grafo, {
      acessoId: acessoB,
      usuarioId: a.usuarioId,
      nome: "produto",
      colunas: ["codprod"],
    });
    const skillA = await treinarECriar(ctx, a.usuarioId, a.acessoId, "Produtos A");
    const skillB = await treinarECriar(ctx, a.usuarioId, acessoB, "Produtos B");
    await ctx.skills.setStatus(skillA, "publicada");
    await ctx.skills.setStatus(skillB, "publicada");
    const gravada = await ctx.aprendizado.salvarConsulta({
      acessoId: a.acessoId,
      skillIds: [skillA],
      pergunta: "lista produtos",
      sql: "SELECT p.codprod AS codigo FROM produto p WHERE p.codprod > 0",
      paramsContrato: [],
      autorUsuarioId: a.usuarioId,
    });
    const consultar = new ConsultarDados(
      ctx.acessos,
      ctx.skills,
      ctx.plug,
      stubSessions(),
      crypto,
      ctx.audit,
      500,
      5000,
      { aprendizado: ctx.aprendizado },
    );
    await expect(
      consultar.execute(a.usuarioId, {
        acessoId: acessoB,
        pergunta: "lista produtos",
        consultaAprendidaId: gravada.id,
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_ERROR });
  });

  it("UUID de coluna do acesso A não muta o grafo do B", async () => {
    const ctx = repos();
    const a = await registrar(ctx, "uuid@b.com", "tok-uuid-a-1111");
    const added = await new AdicionarAcesso(ctx.acessos, ctx.plug, stubSessions(), crypto).execute(
      a.usuarioId,
      { agentId, dialeto: "mssql", clientToken: "tok-uuid-b-2222" },
    );
    const acessoB = added.acesso.id;
    await seedTabelaComColunas(ctx.grafo, {
      acessoId: a.acessoId,
      usuarioId: a.usuarioId,
      nome: "produto",
      colunas: ["codprod"],
    });
    const tabelaA = await ctx.grafo.findTabelaByNome(a.acessoId, "produto");
    const colunasAntes = await ctx.grafo.listColunas(a.acessoId, tabelaA!.id);
    expect(colunasAntes[0]?.descricao).toBeNull();
    await ctx.grafo.mergeColuna({
      acessoId: acessoB,
      tabelaId: tabelaA!.id,
      nome: "codprod",
      descricao: "oráculo cruzado",
      origem: "confirmado_usuario",
      autorUsuarioId: a.usuarioId,
    });
    const colunasDepois = await ctx.grafo.listColunas(a.acessoId, tabelaA!.id);
    expect(colunasDepois[0]?.descricao).toBeNull();
    expect(await ctx.grafo.listColunas(acessoB, tabelaA!.id)).toHaveLength(0);
  });

  it("listar_auditoria N>1 recorta por acessoId e não mistura SQL do outro token", async () => {
    const ctx = repos();
    const a = await registrar(ctx, "aud@b.com", "tok-aud-a-1111");
    const added = await new AdicionarAcesso(ctx.acessos, ctx.plug, stubSessions(), crypto).execute(
      a.usuarioId,
      { agentId, dialeto: "mssql", clientToken: "tok-aud-b-2222" },
    );
    const acessoB = added.acesso.id;
    await ctx.audit.append({
      usuarioId: a.usuarioId,
      acessoId: a.acessoId,
      tool: "consultar_dados",
      sqlEnviado: "SELECT a FROM persona_a",
      sucesso: true,
      codigoErro: null,
      linhasRetornadas: 1,
      duracaoMs: 3,
    });
    await ctx.audit.append({
      usuarioId: a.usuarioId,
      acessoId: acessoB,
      tool: "consultar_dados",
      sqlEnviado: "SELECT b FROM persona_b",
      sucesso: true,
      codigoErro: null,
      linhasRetornadas: 1,
      duracaoMs: 4,
    });
    const listar = new ListarAuditoria(ctx.acessos, ctx.audit);
    await expect(listar.execute(a.usuarioId, {})).rejects.toMatchObject({
      code: ERROR_CODES.VALIDATION_ERROR,
    });
    const listaA = await listar.execute(a.usuarioId, { acessoId: a.acessoId });
    const listaB = await listar.execute(a.usuarioId, { acessoId: acessoB });
    expect(listaA.entradas).toHaveLength(1);
    expect(listaB.entradas).toHaveLength(1);
    expect((await ctx.audit.listByAcesso(a.acessoId, 10)).map((row) => row.sqlEnviado)).toEqual([
      "SELECT a FROM persona_a",
    ]);
    expect((await ctx.audit.listByAcesso(acessoB, 10)).map((row) => row.sqlEnviado)).toEqual([
      "SELECT b FROM persona_b",
    ]);
  });

  it("consultar_dados.aprendizado[] com skillId de outro acesso não falha a consulta nem grava no B", async () => {
    const ctx = repos();
    const a = await registrar(ctx, "aprq2@b.com", "tok-aprq2-a-111");
    const added = await new AdicionarAcesso(ctx.acessos, ctx.plug, stubSessions(), crypto).execute(
      a.usuarioId,
      { agentId, dialeto: "mssql", clientToken: "tok-aprq2-b-222" },
    );
    const acessoB = added.acesso.id;
    await seedTabelaComColunas(ctx.grafo, {
      acessoId: a.acessoId,
      usuarioId: a.usuarioId,
      nome: "produto",
      colunas: ["codprod"],
    });
    await seedTabelaComColunas(ctx.grafo, {
      acessoId: acessoB,
      usuarioId: a.usuarioId,
      nome: "produto",
      colunas: ["codprod"],
    });
    const skillA = await treinarECriar(ctx, a.usuarioId, a.acessoId, "Produtos A");
    const skillB = await treinarECriar(ctx, a.usuarioId, acessoB, "Produtos B");
    await ctx.skills.setStatus(skillA, "publicada");
    await ctx.skills.setStatus(skillB, "publicada");
    const consultar = new ConsultarDados(
      ctx.acessos,
      ctx.skills,
      ctx.plug,
      stubSessions(),
      crypto,
      ctx.audit,
      500,
      5000,
      { grafo: ctx.grafo, aprendizado: ctx.aprendizado, anotacoes: ctx.anotacoes },
    );
    const result = await consultar.execute(a.usuarioId, {
      acessoId: acessoB,
      skillId: skillB,
      pergunta: "lista produtos",
      sql: "SELECT p.codprod AS codigo FROM produto p WHERE p.codprod > 0",
      aprendizado: [
        {
          skillId: skillA,
          tipo: "regra",
          titulo: "Regra A no B",
          texto: "Não grave ponteiro do outro catálogo",
        },
      ],
    });
    expect(result.success).toBe(true);
    expect(result.rowCount).toBeGreaterThan(0);
    expect(result.avisos.some((aviso) => aviso.code === "APRENDIZADO_IGNORADO")).toBe(true);
    expect(await ctx.anotacoes.list(acessoB)).toHaveLength(0);
    expect(await ctx.anotacoes.list(a.acessoId)).toHaveLength(0);
  });
});
