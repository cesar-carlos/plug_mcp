import { describe, expect, it } from "vitest";
import { BuscarContexto, ConsultarDados } from "../../src/application/use-cases/consultar.js";
import {
  AtualizarEscopoPadrao,
  HerdarCatalogo,
  ListarAuditoria,
  RegistrarAprendizado,
  SalvarConsulta,
} from "../../src/application/use-cases/aprendizado.js";
import { RegistrarAcesso } from "../../src/application/use-cases/cofre.js";
import { ERROR_CODES } from "../../src/domain/errors/error-codes.js";
import {
  exigirFiltroEscopoPadrao,
  avisosPlaceholderEscopo,
} from "../../src/application/use-cases/shared/escopo-filtro.js";
import { MemoryQueryResultCache } from "../../src/infrastructure/cache/query-result-cache.js";
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

const crypto = new NodeCryptoAdapter(
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
);
const agentId = "11111111-1111-4111-8111-111111111111";

const setup = async () => {
  const plug = new FakePlugServer();
  plug.approve(agentId);
  const usuarios = new InMemoryUsuarioRepository();
  const acessos = new InMemoryAcessoRepository();
  const grafo = new InMemoryGrafoRepository();
  const skills = new InMemorySkillRepository();
  const anotacoes = new InMemoryAnotacaoGrafoRepository();
  const aprendizado = new InMemoryAprendizadoRepository();
  const audit = new InMemoryAuditLog();
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
  return {
    plug,
    usuarios,
    acessos,
    grafo,
    skills,
    anotacoes,
    aprendizado,
    audit,
    created,
    sessions,
  };
};

describe("aprendizado e escala", () => {
  it("salvar_consulta exige confirmação e reusa SQL", async () => {
    const { acessos, skills, aprendizado, created } = await setup();
    const skill = await skills.create({
      agentId,
      slug: "produtos",
      nome: "Produtos",
      descricao: "Lista",
      sqlModelo: "SELECT p.codprod AS codigo FROM produto p WHERE p.codprod = :codigo",
      autorUsuarioId: created.usuarioId,
    });
    await skills.setStatus(skill.id, "publicada");
    const salvar = new SalvarConsulta(acessos, skills, aprendizado);
    await expect(
      salvar.execute(created.usuarioId, {
        acessoId: created.acessoId,
        skillId: skill.id,
        pergunta: "produto por codigo",
        sql: "SELECT p.codprod AS codigo FROM produto p WHERE p.codprod = :codigo",
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_ERROR });
    const saved = await salvar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      skillId: skill.id,
      pergunta: "produto por codigo",
      sql: "SELECT p.codprod AS codigo FROM produto p WHERE p.codprod = :codigo",
      confirmadoPeloUsuario: true,
    });
    expect(saved.consulta.execucoes).toBe(1);
  });

  it("buscar_contexto devolve consultas aprendidas, expande sinônimo e grava lacuna", async () => {
    const { acessos, grafo, skills, anotacoes, aprendizado, plug, sessions, created } =
      await setup();
    const skill = await skills.create({
      agentId,
      slug: "receber",
      nome: "Carteira",
      descricao: "Títulos a receber",
      sqlModelo: "SELECT r.valor AS valor FROM receber r WHERE r.vencimento >= :inicio",
      autorUsuarioId: created.usuarioId,
    });
    await skills.setStatus(skill.id, "publicada");
    await aprendizado.salvarConsulta({
      agentId,
      skillIds: [skill.id],
      pergunta: "duplicatas da carteira",
      sql: "SELECT SUM(r.valor) AS total FROM receber r WHERE r.vencimento < :hoje",
      paramsContrato: [],
      autorUsuarioId: created.usuarioId,
    });
    await aprendizado.registrarSinonimo({
      agentId,
      termo: "duplicatas",
      alvoTipo: "skill",
      alvoId: "carteira",
    });
    const buscar = new BuscarContexto(
      acessos,
      grafo,
      skills,
      anotacoes,
      plug,
      sessions,
      crypto,
      aprendizado,
    );
    const hit = await buscar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      query: "duplicatas",
    });
    expect(hit.consultaPermitida).toBe(true);
    expect(hit.consultasAprendidas.length).toBeGreaterThan(0);
    expect(hit.hint).toMatch(/reutilize/i);

    const gap = await buscar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      query: "xyzzy-inexistente-999",
    });
    expect(gap.consultaPermitida).toBe(false);
    expect(gap.gap?.code).toBe("SKILL_GAP");
  });

  it("registrar_aprendizado grava regra e herdar_catalogo preenche o grafo", async () => {
    const { acessos, grafo, anotacoes, aprendizado, created } = await setup();
    const registrar = new RegistrarAprendizado(acessos, grafo, anotacoes, aprendizado);
    const nota = await registrar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      tipo: "regra",
      titulo: "Não somar cancelados",
      texto: "Status C não entra no faturamento.",
    });
    expect(nota.anotacao?.tipo).toBe("regra");

    const herdar = new HerdarCatalogo(acessos, grafo);
    await expect(
      herdar.execute(created.usuarioId, { acessoId: created.acessoId }),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_ERROR });
    const copied = await herdar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      confirmadoPeloUsuario: true,
    });
    expect(copied.tabelas).toBeGreaterThan(0);
    expect(copied.origem).toBe("inferido");
    expect(copied.publicaSkill).toBe(false);
    expect(await grafo.findTabelaByNome(agentId, "receber")).not.toBeNull();
    expect(await grafo.findTabelaByNome(agentId, "pagar")).not.toBeNull();
    const rels = await grafo.listRelacionamentos(agentId);
    expect(rels.some((rel) => rel.pares.length > 1)).toBe(true);
  });

  it("escopo empresa/filial recusa SQL sem o predicado quando a coluna existe", () => {
    expect(() =>
      exigirFiltroEscopoPadrao({
        sql: "SELECT r.valor AS valor FROM receber r",
        colunasDasTabelas: { receber: ["valor", "empresa", "filial"] },
        escopoPadrao: { empresa: "1" },
      }),
    ).toThrowError(/empresa/);
    expect(() =>
      exigirFiltroEscopoPadrao({
        sql: "SELECT r.valor AS valor FROM receber r WHERE r.empresa = :empresa",
        colunasDasTabelas: { receber: ["valor", "empresa"] },
        escopoPadrao: { empresa: "1" },
      }),
    ).not.toThrow();
  });

  it("PLACEHOLDER_ESCOPO só quando a coluna empresa/filial existe no grafo", () => {
    expect(
      avisosPlaceholderEscopo({
        sql: "SELECT p.codprod FROM produto p WHERE p.codprod > 0",
        colunasDasTabelas: { produto: ["codprod"] },
        escopoPadrao: { empresa: "1" },
      }),
    ).toEqual([]);
    const avisos = avisosPlaceholderEscopo({
      sql: "SELECT r.valor FROM receber r WHERE r.empresa = '1'",
      colunasDasTabelas: { receber: ["valor", "empresa"] },
      escopoPadrao: { empresa: "1" },
    });
    expect(avisos.some((aviso) => aviso.code === "PLACEHOLDER_ESCOPO")).toBe(true);
  });

  it("consultar_dados promove fatos e usa cache de agregação", async () => {
    const { plug, acessos, grafo, skills, anotacoes, aprendizado, audit, created, sessions } =
      await setup();
    let calls = 0;
    plug.sqlImpl = async () => {
      calls += 1;
      return { columns: ["total"], rows: [{ total: 10 }] };
    };
    const skill = await skills.create({
      agentId,
      slug: "produtos",
      nome: "Produtos",
      descricao: "Lista",
      sqlModelo: "SELECT p.codprod AS codigo FROM produto p",
      autorUsuarioId: created.usuarioId,
    });
    await skills.setStatus(skill.id, "publicada");
    const cache = new MemoryQueryResultCache();
    const consultar = new ConsultarDados(
      acessos,
      skills,
      plug,
      sessions,
      crypto,
      audit,
      500,
      5000,
      { grafo, aprendizado, anotacoes, cache, cacheTtlMs: 60_000 },
    );
    await consultar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      pergunta: "consulta agregada",
      skillId: skill.id,
    });
    const tabela = await grafo.findTabelaByNome(agentId, "produto");
    expect(tabela?.origem).toBe("validado_execucao");

    await consultar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      pergunta: "consulta agregada",
      skillId: skill.id,
      sql: "SELECT SUM(p.codprod) AS total FROM produto p WHERE p.codprod > 0",
    });
    const firstCalls = calls;
    const cached = await consultar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      pergunta: "consulta agregada",
      skillId: skill.id,
      sql: "SELECT SUM(p.codprod) AS total FROM produto p WHERE p.codprod > 0",
    });
    expect(calls).toBe(firstCalls);
    expect(cached.avisos.some((aviso) => aviso.code === "CACHE")).toBe(true);
  });

  it("cache de consulta isola tokens do mesmo agentId", async () => {
    const {
      plug,
      usuarios,
      acessos,
      grafo,
      skills,
      anotacoes,
      aprendizado,
      audit,
      created,
      sessions,
    } = await setup();
    let calls = 0;
    plug.sqlImpl = async () => {
      calls += 1;
      return { columns: ["total"], rows: [{ total: 10 }] };
    };
    const skill = await skills.create({
      agentId,
      slug: "agg",
      nome: "Agg",
      descricao: "Soma",
      sqlModelo: "SELECT SUM(p.codprod) AS total FROM produto p WHERE p.codprod > 0",
      autorUsuarioId: created.usuarioId,
    });
    await skills.setStatus(skill.id, "publicada");
    const cache = new MemoryQueryResultCache();
    const consultar = new ConsultarDados(
      acessos,
      skills,
      plug,
      sessions,
      crypto,
      audit,
      500,
      5000,
      { grafo, aprendizado, anotacoes, cache, cacheTtlMs: 60_000 },
    );
    const sql = "SELECT SUM(p.codprod) AS total FROM produto p WHERE p.codprod > 0";
    await consultar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      pergunta: "total",
      skillId: skill.id,
      sql,
    });
    const other = await new RegistrarAcesso(
      usuarios,
      acessos,
      plug,
      crypto,
      new SetupCodeStore(),
      "http://localhost",
      0,
    ).execute({
      email: "other@b.com",
      senha: "secret-pass",
      agentId,
      dialeto: "sybase",
      clientToken: "tok-sql-other-99",
    });
    const otherConsultar = new ConsultarDados(
      acessos,
      skills,
      plug,
      sessions,
      crypto,
      audit,
      500,
      5000,
      { grafo, aprendizado, anotacoes, cache, cacheTtlMs: 60_000 },
    );
    await otherConsultar.execute(other.usuarioId, {
      acessoId: other.acessoId,
      pergunta: "total",
      skillId: skill.id,
      sql,
    });
    expect(calls).toBe(2);
  });

  it("consultar_dados grava o SQL e regra na mesma chamada", async () => {
    const { plug, acessos, grafo, skills, anotacoes, aprendizado, audit, created, sessions } =
      await setup();
    plug.sqlImpl = async () => ({ columns: ["codigo"], rows: [{ codigo: 1 }] });
    const skill = await skills.create({
      agentId,
      slug: "produtos",
      nome: "Produtos",
      descricao: "Lista",
      sqlModelo: "SELECT p.codprod AS codigo FROM produto p",
      autorUsuarioId: created.usuarioId,
    });
    await skills.setStatus(skill.id, "publicada");
    const consultar = new ConsultarDados(
      acessos,
      skills,
      plug,
      sessions,
      crypto,
      audit,
      500,
      5000,
      { grafo, aprendizado, anotacoes },
    );
    const result = await consultar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      skillId: skill.id,
      pergunta: "quais produtos existem",
      sql: "SELECT p.codprod AS codigo FROM produto p WHERE p.codprod > 0",
      aprendizado: [
        {
          tipo: "regra",
          titulo: "Produto ativo",
          texto: "Só listar produto com situacao = A.",
        },
      ],
    });
    expect(result.aprendizadoGravado?.nova).toBe(true);
    expect(result.aprendizadoGravado?.perguntaUsada).toBe("quais produtos existem");
    expect(result.aprendizadoGravado?.itens).toBe(1);
    const learned = await aprendizado.buscarConsultas(agentId, "quais produtos", 5);
    expect(learned).toHaveLength(1);
    const notas = await anotacoes.list(agentId);
    expect(notas.some((nota) => nota.tipo === "regra" && nota.titulo === "Produto ativo")).toBe(
      true,
    );
  });

  it("atualizar_escopo_padrao e listar_auditoria", async () => {
    const { acessos, audit, created } = await setup();
    const atualizar = new AtualizarEscopoPadrao(acessos);
    const updated = await atualizar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      empresa: "1",
      filial: "2",
      timezone: "America/Cuiaba",
      confirmadoPeloUsuario: true,
    });
    expect(updated.escopoPadrao?.empresa).toBe("1");
    await audit.append({
      usuarioId: created.usuarioId,
      acessoId: created.acessoId,
      tool: "consultar_dados",
      sqlEnviado: "skill:x",
      sucesso: true,
      codigoErro: null,
      linhasRetornadas: 1,
      duracaoMs: 10,
    });
    const listar = new ListarAuditoria(acessos, audit);
    const listed = await listar.execute(created.usuarioId, { acessoId: created.acessoId });
    expect(listed.entradas.length).toBeGreaterThan(0);
    expect(listed.entradas[0]?.tool).toBe("consultar_dados");
  });
});
