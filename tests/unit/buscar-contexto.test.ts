import { describe, expect, it } from "vitest";
import { BuscarContexto } from "../../src/application/use-cases/consultar.js";
import { RegistrarAcesso } from "../../src/application/use-cases/cofre.js";
import { NodeCryptoAdapter } from "../../src/infrastructure/crypto/node-crypto.adapter.js";
import { SetupCodeStore } from "../../src/infrastructure/http/setup-code-store.js";
import {
  InMemoryAprendizadoRepository,
  InMemoryAcessoRepository,
  InMemoryAnotacaoGrafoRepository,
  InMemoryAuditLog,
  InMemoryGrafoRepository,
  InMemorySkillRepository,
  InMemoryUsuarioRepository,
} from "../../src/infrastructure/persistence/memory/memory-cofre.js";
import { PACOTE_VERSAO_ATUAL, parseEscopoSkill } from "../../src/domain/entities/escopo.js";
import { parseTagsTelemetriaBusca } from "../../src/application/use-cases/shared/telemetria-busca.js";
import { stemPortugues } from "../../src/domain/entities/stem-portugues.js";
import { FakePlugServer } from "../helpers/fake-plug-server.js";
import { SilentTestLogger } from "../helpers/silent-logger.js";

const crypto = new NodeCryptoAdapter(
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
);
const agentId = "11111111-1111-4111-8111-111111111111";

describe("BuscarContexto", () => {
  const setup = async () => {
    const plug = new FakePlugServer();
    plug.approve(agentId);
    const usuarios = new InMemoryUsuarioRepository();
    const acessos = new InMemoryAcessoRepository();
    const grafo = new InMemoryGrafoRepository();
    const skills = new InMemorySkillRepository();
    const anotacoes = new InMemoryAnotacaoGrafoRepository();
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
    const sessions = {
      getAccessToken: async () => "access-test",
      invalidate: () => undefined,
      remember: () => undefined,
    };
    const audit = new InMemoryAuditLog();
    const buscar = new BuscarContexto(
      acessos,
      grafo,
      skills,
      anotacoes,
      plug,
      sessions,
      crypto,
      aprendizado,
      audit,
      new SilentTestLogger(),
    );
    return { buscar, created, skills, aprendizado, anotacoes, grafo, plug, audit };
  };

  it("sem skill publicada devolve consultaPermitida false e SKILL_GAP", async () => {
    const { buscar, created } = await setup();
    const result = await buscar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      query: "produto",
    });
    expect(result.success).toBe(true);
    expect(result.consultaPermitida).toBe(false);
    expect(result.gap?.code).toBe("SKILL_GAP");
    expect(result.skillsPublicadas).toHaveLength(0);
    expect(result.grafoParaTreino).toBeDefined();
    expect(result.fluxoTreino).toBeUndefined();
    expect(result.hint ?? "").not.toMatch(/sinonimo/);
  });

  it("com rascunho oriente a continuar o fluxo em vez de recomeçar", async () => {
    const { buscar, created, skills } = await setup();
    await skills.create({
      acessoId: created.acessoId,
      slug: "rascunho-produtos",
      nome: "Lista de produtos",
      descricao: "Ainda em treino",
      sqlModelo: "SELECT p.codprod AS codigo FROM produto p",
      autorUsuarioId: created.usuarioId,
    });
    const result = await buscar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      query: "produtos",
    });
    expect(result.consultaPermitida).toBe(false);
    expect(result.blockingReason).toBe("SKILL_NOT_PUBLISHED");
    expect(result.gap).toBeUndefined();
    expect(result.nextAction).toBeTruthy();
    expect(result.fluxoTreino?.proximoPasso).toBeTruthy();
  });

  it("casa pergunta certificada (nome/descrição/params, não o SQL)", async () => {
    const { buscar, created, skills } = await setup();
    const published = await skills.create({
      acessoId: created.acessoId,
      slug: "saldo-aberto",
      nome: "Contas",
      descricao: "Títulos",
      sqlModelo: "SELECT p.codprod AS codigo FROM produto p WHERE p.saldo_aberto = :flag",
      params: [{ nome: "flag", descricao: "Saldo em aberto", obrigatorio: true, tipo: "string" }],
      autorUsuarioId: created.usuarioId,
    });
    await skills.setStatus(published.id, "publicada");
    const result = await buscar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      query: "saldo aberto",
    });
    expect(result.consultaPermitida).toBe(true);
    expect(result.skillsPublicadas.some((s) => s.id === published.id)).toBe(true);
  });

  it("com skill publicada lista só publicadas e permite consulta", async () => {
    const { buscar, created, skills } = await setup();
    const published = await skills.create({
      acessoId: created.acessoId,
      slug: "produtos",
      nome: "Produtos",
      descricao: "Lista de produtos",
      sqlModelo: "SELECT p.codprod AS codigo FROM produto p",
      autorUsuarioId: created.usuarioId,
    });
    await skills.setStatus(published.id, "publicada");
    await skills.create({
      acessoId: created.acessoId,
      slug: "rascunho-produtos",
      nome: "Rascunho produtos",
      descricao: "Ainda não publica",
      sqlModelo: "SELECT p.codprod AS codigo FROM produto p",
      autorUsuarioId: created.usuarioId,
    });
    const result = await buscar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      query: "produtos",
    });
    expect(result.consultaPermitida).toBe(true);
    expect(result.gap).toBeUndefined();
    expect(result.skillsPublicadas).toHaveLength(1);
  });

  it("casa pergunta em linguagem natural com skill publicada", async () => {
    const { buscar, created, skills } = await setup();
    const published = await skills.create({
      acessoId: created.acessoId,
      slug: "faturamento-cliente",
      nome: "Faturamento por cliente",
      descricao: "Total faturado no mês por cliente",
      sqlModelo: "SELECT c.nome FROM cliente c",
      autorUsuarioId: created.usuarioId,
    });
    await skills.setStatus(published.id, "publicada");
    for (let i = 0; i < 8; i += 1) {
      await skills.create({
      acessoId: created.acessoId,
        slug: `rascunho-${String(i)}`,
        nome: `Rascunho ${String(i)}`,
        descricao: "Ainda não publica",
        sqlModelo: "SELECT p.codprod AS codigo FROM produto p",
        autorUsuarioId: created.usuarioId,
      });
    }
    const result = await buscar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      query: "faturamento por cliente no mês",
    });
    expect(result.consultaPermitida).toBe(true);
    expect(result.skillsPublicadas.some((s) => s.id === published.id)).toBe(true);
    expect(result.skillsParaTreino?.length ?? 0).toBeGreaterThanOrEqual(0);
  });

  it("escolhe rascunho mais relevante da query, não o primeiro inserido", async () => {
    const { buscar, created, skills } = await setup();
    await skills.create({
      acessoId: created.acessoId,
      slug: "lista-xyz",
      nome: "Lista xyz",
      descricao: "Rascunho genérico",
      sqlModelo: "SELECT p.codprod AS codigo FROM produto p",
      autorUsuarioId: created.usuarioId,
    });
    const relevant = await skills.create({
      acessoId: created.acessoId,
      slug: "faturamento-cliente",
      nome: "Faturamento por cliente",
      descricao: "Total faturado no mês por cliente",
      sqlModelo: "SELECT c.nome FROM cliente c",
      autorUsuarioId: created.usuarioId,
    });
    const result = await buscar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      query: "faturamento cliente",
    });
    expect(result.consultaPermitida).toBe(false);
    expect(result.blockingReason).toBe("SKILL_NOT_PUBLISHED");
    expect(result.gap).toBeUndefined();
    expect(result.skillsParaTreino[0]?.id).toBe(relevant.id);
  });

  it("CTX-04 faturamento não casa receber/pagar em treino", async () => {
    const { buscar, created, skills } = await setup();
    await skills.create({
      acessoId: created.acessoId,
      slug: "titulos-a-receber",
      nome: "Títulos a receber",
      descricao: "Saldo em aberto de clientes",
      sqlModelo: "SELECT r.valor FROM receber r WHERE r.mensal = 1",
      autorUsuarioId: created.usuarioId,
    });
    await skills.create({
      acessoId: created.acessoId,
      slug: "titulos-a-pagar",
      nome: "Títulos a pagar",
      descricao: "Saldo a pagar a fornecedores",
      sqlModelo: "SELECT p.valor FROM pagar p WHERE p.mensal = 1",
      autorUsuarioId: created.usuarioId,
    });
    const result = await buscar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      query: "Qual meu faturamento mensal?",
    });
    expect(result.consultaPermitida).toBe(false);
    expect(result.blockingReason).toBeUndefined();
    expect(result.gap?.code).toBe("SKILL_GAP");
    expect(result.skillsParaTreino.map((item) => item.slug)).not.toContain("titulos-a-receber");
    expect(result.skillsParaTreino.map((item) => item.slug)).not.toContain("titulos-a-pagar");
  });

  it("CTX-03 pagar em treino é SKILL_NOT_PUBLISHED", async () => {
    const { buscar, created, skills } = await setup();
    const pagar = await skills.create({
      acessoId: created.acessoId,
      slug: "titulos-a-pagar",
      nome: "Títulos a pagar",
      descricao: "Quanto tenho para pagar",
      sqlModelo: "SELECT p.valor FROM pagar p",
      autorUsuarioId: created.usuarioId,
    });
    const result = await buscar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      query: "quanto tenho para pagar",
    });
    expect(result.blockingReason).toBe("SKILL_NOT_PUBLISHED");
    expect(result.gap).toBeUndefined();
    expect(result.skillsParaTreino[0]?.id).toBe(pagar.id);
  });

  it("em pergunta de período pede para reutilizar consultasAprendidas com params ou OVER", async () => {
    const { buscar, created, skills, aprendizado } = await setup();
    const published = await skills.create({
      acessoId: created.acessoId,
      slug: "faturamento",
      nome: "Faturamento",
      descricao: "Total faturado",
      sqlModelo: "SELECT p.valor FROM produto p WHERE p.data >= :dataInicio",
      autorUsuarioId: created.usuarioId,
    });
    await skills.setStatus(published.id, "publicada");
    await aprendizado.salvarConsulta({
      acessoId: created.acessoId,
      skillIds: [published.id],
      pergunta: "faturamento no período",
      sql: "SELECT SUM(p.valor) AS total FROM produto p WHERE p.data >= :dataInicio",
      paramsContrato: [
        { nome: "dataInicio", descricao: "Início", obrigatorio: true, tipo: "date" },
      ],
      autorUsuarioId: created.usuarioId,
    });
    const result = await buscar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      query: "comparar faturamento no período",
    });
    expect(result.consultasAprendidas.length).toBeGreaterThan(0);
    expect(result.consultasAprendidas[0]).not.toHaveProperty("sql");
    expect(result.skillsPublicadas[0]).not.toHaveProperty("sqlModelo");
    expect(result.hint).toContain(result.consultasAprendidas[0]?.id ?? "");
    expect(result.hint).toMatch(/consultasExemplo/);
    expect(result.hint).toMatch(/OVER\/LAG/);
  });

  it("corpo de regra longo não completa cobertura certificada", async () => {
    const { buscar, created, skills, anotacoes } = await setup();
    const published = await skills.create({
      acessoId: created.acessoId,
      slug: "titulos",
      nome: "Títulos",
      descricao: "Saldo financeiro",
      sqlModelo: "SELECT t.valor FROM titulo t",
      autorUsuarioId: created.usuarioId,
    });
    await skills.setStatus(published.id, "publicada");
    await anotacoes.create({
      acessoId: created.acessoId,
      tabelaId: null,
      skillId: published.id,
      tipo: "regra",
      titulo: "Filtro operacional",
      texto: "Clientes ativos em Sinop nunca devem misturar faturamento cancelado com produto.",
      autorUsuarioId: created.usuarioId,
    });
    const result = await buscar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      query: "clientes ativos sinop",
    });
    expect(result.consultaPermitida).toBe(false);
    expect(result.conhecimentos.some((item) => item.tipo === "regra")).toBe(true);
  });

  it("SQL de consulta aprendida não ranqueia nem completa cobertura", async () => {
    const { buscar, created, skills, aprendizado } = await setup();
    const published = await skills.create({
      acessoId: created.acessoId,
      slug: "itens",
      nome: "Itens",
      descricao: "Cadastro de itens",
      sqlModelo: "SELECT p.codprod AS codigo FROM produto p",
      autorUsuarioId: created.usuarioId,
    });
    await skills.setStatus(published.id, "publicada");
    await aprendizado.salvarConsulta({
      acessoId: created.acessoId,
      skillIds: [published.id],
      pergunta: "lista de itens do catalogo",
      sql: "SELECT p.codprodunico FROM produto p WHERE p.codprodunico > 0",
      paramsContrato: [],
      autorUsuarioId: created.usuarioId,
    });
    const bySql = await aprendizado.buscarConsultas(created.acessoId, "codprodunico", 5);
    expect(bySql).toHaveLength(0);
    const result = await buscar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      query: "codprodunico",
    });
    expect(result.consultaPermitida).toBe(false);
    expect(result.consultasAprendidas).toHaveLength(0);
  });

  it("nota com skillId inclui a skill em candidatos mesmo se nome não bate", async () => {
    const { buscar, created, skills, anotacoes } = await setup();
    const published = await skills.create({
      acessoId: created.acessoId,
      slug: "contas-abertas",
      nome: "Contas",
      descricao: "Títulos em aberto",
      sqlModelo: "SELECT t.valor FROM titulo t",
      autorUsuarioId: created.usuarioId,
    });
    await skills.setStatus(published.id, "publicada");
    await anotacoes.create({
      acessoId: created.acessoId,
      tabelaId: null,
      skillId: published.id,
      tipo: "regra",
      titulo: "Fórmula",
      texto: "cashbackxyz usa validade do crédito como recorte.",
      autorUsuarioId: created.usuarioId,
    });
    const result = await buscar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      query: "cashbackxyz",
    });
    expect(result.skillsPublicadas.some((skill) => skill.id === published.id)).toBe(true);
    expect(result.consultaPermitida).toBe(false);
    expect(
      result.conhecimentos.some(
        (item) => item.tipo === "regra" && item.trecho.includes("cashbackxyz"),
      ),
    ).toBe(true);
    expect(result.hint).toMatch(/obter_skill/);
  });

  it("não vaza conhecimentos de outro agentId", async () => {
    const { buscar, created, anotacoes } = await setup();
    const otherAgent = "22222222-2222-4222-8222-222222222222";
    await anotacoes.create({
      acessoId: otherAgent,
      tabelaId: null,
      skillId: null,
      tipo: "regra",
      titulo: "Segredo",
      texto: "nao vazedadosxyz em outro tenant.",
      autorUsuarioId: created.usuarioId,
    });
    const result = await buscar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      query: "vazedadosxyz",
    });
    expect(result.conhecimentos.some((item) => item.trecho.includes("vazedadosxyz"))).toBe(false);
  });

  it("com consultaPermitida não inclui tabela fora do pacote em conhecimentos", async () => {
    const { buscar, created, skills, grafo } = await setup();
    const published = await skills.create({
      acessoId: created.acessoId,
      slug: "produtos",
      nome: "Produtos",
      descricao: "Lista de produtos",
      sqlModelo: "SELECT p.codprod AS codigo FROM produto p",
      escopo: {
        tabelas: ["produto"],
        colunasPorTabela: { produto: ["codprod"] },
        relacionamentos: [],
        graoPorTabela: {},
        graoResultado: [],
        metricasSaida: [],
        pacoteVersao: PACOTE_VERSAO_ATUAL,
      },
      autorUsuarioId: created.usuarioId,
    });
    await skills.setStatus(published.id, "publicada");
    await grafo.mergeTabela({
      acessoId: created.acessoId,
      nome: "auditoria_produtos",
      descricao: "produtos fora do pacote",
      origem: "inferido",
      autorUsuarioId: created.usuarioId,
    });
    const result = await buscar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      query: "produtos",
    });
    expect(result.consultaPermitida).toBe(true);
    expect(
      result.conhecimentos.some(
        (item) => item.tipo === "tabela" && item.titulo === "auditoria_produtos",
      ),
    ).toBe(false);
  });

  it("grafoParaTreino.anotacoes omite nota com tabelaId irresolvível", async () => {
    const { buscar, created, anotacoes } = await setup();
    await anotacoes.create({
      acessoId: created.acessoId,
      tabelaId: "99999999-9999-4999-8999-999999999999",
      skillId: null,
      tipo: "regra",
      titulo: "Fantasma",
      texto: "tokenirresolvivelxyz não deve vazar.",
      autorUsuarioId: created.usuarioId,
    });
    const result = await buscar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      query: "tokenirresolvivelxyz",
    });
    expect(result.consultaPermitida).toBe(false);
    expect(
      (result.grafoParaTreino?.anotacoes as { texto?: string }[] | undefined)?.some((nota) =>
        nota.texto?.includes("tokenirresolvivelxyz"),
      ),
    ).toBe(false);
    expect(result.conhecimentos.some((item) => item.trecho.includes("tokenirresolvivelxyz"))).toBe(
      false,
    );
  });

  it("grafoParaTreino.anotacoes omite nota de tabela fora da policy", async () => {
    const { buscar, created, anotacoes, grafo, plug } = await setup();
    plug.policy = { allTables: false, tables: ["produto"] };
    const { tabela } = await grafo.mergeTabela({
      acessoId: created.acessoId,
      nome: "segredo_interno",
      descricao: "tabela recortada",
      origem: "inferido",
      autorUsuarioId: created.usuarioId,
    });
    await anotacoes.create({
      acessoId: created.acessoId,
      tabelaId: tabela.id,
      skillId: null,
      tipo: "regra",
      titulo: "Sigilo",
      texto: "policydenyxyz não sai no gap.",
      autorUsuarioId: created.usuarioId,
    });
    const result = await buscar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      query: "policydenyxyz",
    });
    expect(
      (result.grafoParaTreino?.anotacoes as { texto?: string }[] | undefined)?.some((nota) =>
        nota.texto?.includes("policydenyxyz"),
      ),
    ).toBe(false);
  });

  it("sinônimo entra no haystack de evidência da skill", async () => {
    const { buscar, created, skills, aprendizado } = await setup();
    const published = await skills.create({
      acessoId: created.acessoId,
      slug: "vendas",
      nome: "Vendas",
      descricao: "Totais do período",
      sqlModelo: "SELECT p.valor FROM produto p",
      autorUsuarioId: created.usuarioId,
    });
    await skills.setStatus(published.id, "publicada");
    await aprendizado.registrarSinonimo({
      acessoId: created.acessoId,
      termo: "faturamentoabc",
      alvoTipo: "skill",
      alvoId: published.id,
    });
    const result = await buscar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      query: "faturamentoabc",
    });
    expect(
      result.conhecimentos.some((item) => item.tipo === "skill" && item.id === published.id),
    ).toBe(true);
    expect(result.skillsPublicadas.some((item) => item.id === published.id)).toBe(true);
    expect(result.consultaPermitida).toBe(true);
  });

  it("sinônimo por slug ainda resolve a skill", async () => {
    const { buscar, created, skills, aprendizado } = await setup();
    const published = await skills.create({
      acessoId: created.acessoId,
      slug: "vendas",
      nome: "Vendas",
      descricao: "Totais do período",
      sqlModelo: "SELECT p.valor FROM produto p",
      autorUsuarioId: created.usuarioId,
    });
    await skills.setStatus(published.id, "publicada");
    await aprendizado.registrarSinonimo({
      acessoId: created.acessoId,
      termo: "faturamentoabc",
      alvoTipo: "skill",
      alvoId: "vendas",
    });
    const result = await buscar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      query: "faturamentoabc",
    });
    expect(
      result.conhecimentos.some((item) => item.tipo === "skill" && item.id === published.id),
    ).toBe(true);
  });

  it("hint de regra sobrevive quando o teto está cheio de tabelas", async () => {
    const { buscar, created, skills, anotacoes, grafo } = await setup();
    const published = await skills.create({
      acessoId: created.acessoId,
      slug: "contas-teto",
      nome: "Contas",
      descricao: "Titulos",
      sqlModelo: "SELECT 1",
      autorUsuarioId: created.usuarioId,
    });
    await skills.setStatus(published.id, "publicada");
    await anotacoes.create({
      acessoId: created.acessoId,
      tabelaId: null,
      skillId: published.id,
      tipo: "regra",
      titulo: "Fórmula",
      texto: "alphateto usa recorte próprio.",
      autorUsuarioId: created.usuarioId,
    });
    for (let i = 0; i < 8; i += 1) {
      await grafo.mergeTabela({
      acessoId: created.acessoId,
        nome: `alpha_teto_${i}`,
        descricao: "alphateto volume",
        origem: "inferido",
        autorUsuarioId: created.usuarioId,
      });
    }
    const result = await buscar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      query: "alphateto",
    });
    expect(result.consultaPermitida).toBe(false);
    expect(result.conhecimentos.some((item) => item.tipo === "regra")).toBe(true);
    expect(result.hint).toMatch(/obter_skill/);
  });

  it("consulta inativa não entra em consultasAprendidas nem conhecimentos", async () => {
    const { buscar, created, skills, aprendizado } = await setup();
    const published = await skills.create({
      acessoId: created.acessoId,
      slug: "itens-inativa",
      nome: "Itens",
      descricao: "Cadastro de itens",
      sqlModelo: "SELECT p.codprod AS codigo FROM produto p",
      autorUsuarioId: created.usuarioId,
    });
    await skills.setStatus(published.id, "publicada");
    const saved = await aprendizado.salvarConsulta({
      acessoId: created.acessoId,
      skillIds: [published.id],
      pergunta: "lista de itens do catalogo inativo",
      sql: "SELECT 1",
      paramsContrato: [],
      autorUsuarioId: created.usuarioId,
    });
    aprendizado.marcarStatusConsulta(saved.id, "inativa");
    const result = await buscar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      query: "catalogo inativo",
    });
    expect(result.consultasAprendidas).toHaveLength(0);
    expect(result.conhecimentos.some((item) => item.tipo === "consulta_aprendida")).toBe(false);
  });

  it("omite nota sem tabela de skill que não está nos candidatos", async () => {
    const { buscar, created, anotacoes } = await setup();
    await anotacoes.create({
      acessoId: created.acessoId,
      tabelaId: null,
      skillId: "99999999-9999-4999-8999-999999999999",
      tipo: "regra",
      titulo: "Órfã",
      texto: "orfaoskillxyz não deve aparecer no gap.",
      autorUsuarioId: created.usuarioId,
    });
    const result = await buscar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      query: "orfaoskillxyz",
    });
    expect(result.conhecimentos.some((item) => item.trecho.includes("orfaoskillxyz"))).toBe(false);
  });

  it("grava telemetria no audit sem a pergunta", async () => {
    const { buscar, created, audit } = await setup();
    const query = "produto secretoxyzabc";
    await buscar.execute(created.usuarioId, { acessoId: created.acessoId, query });
    const row = audit.entries.find((item) => item.tool === "buscar_contexto");
    expect(row).toBeDefined();
    expect(row?.sqlEnviado ?? "").not.toContain(query);
    expect(row?.sqlEnviado ?? "").not.toContain("secretoxyzabc");
    const tags = parseTagsTelemetriaBusca(row?.sqlEnviado ?? null);
    expect(tags?.cobertura).toBe("desconhecida");
    expect(tags?.consultaPermitida).toBe(false);
    expect(tags?.gap).toBe("SKILL_GAP");
  });

  it("com KPI e cobertura completa devolve consultaSemanticaSugerida", async () => {
    const { buscar, created, skills, grafo } = await setup();
    await grafo.mergeTabela({
      acessoId: created.acessoId,
      nome: "produto",
      origem: "validado_execucao",
      autorUsuarioId: created.usuarioId,
    });
    const published = await skills.create({
      acessoId: created.acessoId,
      slug: "produtos",
      nome: "Produtos",
      descricao: "Lista de produtos",
      sqlModelo: "SELECT SUM(p.valor) AS total FROM produto p WHERE p.codprod > 0",
      autorUsuarioId: created.usuarioId,
    });
    await skills.update(published.id, {
      escopo: parseEscopoSkill({
        tabelas: ["produto"],
        colunasPorTabela: { produto: ["valor"] },
        metricasSaida: [
          {
            alias: "total",
            expr: "SUM(p.valor)",
            definicao: "total de produtos",
            dimensoesPermitidas: ["empresa"],
            colunaData: "data",
          },
        ],
      }),
    });
    await skills.setStatus(published.id, "publicada");
    const result = await buscar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      query: "produtos",
    });
    expect(result.consultaPermitida).toBe(true);
    expect(result.consultaSemanticaSugerida).toEqual({
      versao: 1,
      metrica: "total",
      dimensoes: ["empresa"],
      colunaData: "data",
    });
    expect(result.hint).toMatch(/consultaSemantica/);
    expect(result.skillsPublicadas[0]).not.toHaveProperty("sqlModelo");
    expect(result.fluxoTreino?.passoAtual).toBe("publicar_skill");
    expect(result.fluxoTreino?.proximoPasso).toBeNull();
    expect(result.fluxoTreino?.passos.find((item) => item.id === "criar_skill")?.status).toBe(
      "feito",
    );
  });

  it("com duas skills capazes escolhe o KPI cujo haystack overlap mais a pergunta", async () => {
    const { buscar, created, skills } = await setup();
    const produtos = await skills.create({
      acessoId: created.acessoId,
      slug: "produtos",
      nome: "Produtos",
      descricao: "Lista de produtos",
      sqlModelo: "SELECT SUM(p.qtd) AS saldo FROM produto p WHERE p.codprod > 0",
      autorUsuarioId: created.usuarioId,
    });
    await skills.update(produtos.id, {
      escopo: parseEscopoSkill({
        tabelas: ["produto"],
        colunasPorTabela: { produto: ["qtd"] },
        metricasSaida: [{ alias: "saldo", expr: "SUM(p.qtd)", definicao: "estoque atual" }],
      }),
    });
    await skills.setStatus(produtos.id, "publicada");
    const vendas = await skills.create({
      acessoId: created.acessoId,
      slug: "vendas-produtos",
      nome: "Vendas de produtos",
      descricao: "Lista de produtos vendidos",
      sqlModelo: "SELECT SUM(v.valor) AS receita FROM produto v WHERE v.codprod > 0",
      autorUsuarioId: created.usuarioId,
    });
    await skills.update(vendas.id, {
      escopo: parseEscopoSkill({
        tabelas: ["produto"],
        colunasPorTabela: { produto: ["valor"] },
        metricasSaida: [{ alias: "receita", expr: "SUM(v.valor)", definicao: "faturamento bruto" }],
      }),
    });
    await skills.setStatus(vendas.id, "publicada");
    const result = await buscar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      query: "produtos faturamento",
    });
    expect(result.consultaPermitida).toBe(true);
    expect(result.consultaSemanticaSugerida).toMatchObject({ metrica: "receita" });
  });

  it("cobertura parcial com KPI não devolve esqueleto e pede sinônimo", async () => {
    const { buscar, created, skills } = await setup();
    const published = await skills.create({
      acessoId: created.acessoId,
      slug: "titulos",
      nome: "Títulos",
      descricao: "Saldo financeiro",
      sqlModelo: "SELECT SUM(t.valor) AS total FROM titulo t WHERE t.valor > 0",
      autorUsuarioId: created.usuarioId,
    });
    await skills.update(published.id, {
      escopo: parseEscopoSkill({
        tabelas: ["titulo"],
        colunasPorTabela: { titulo: ["valor"] },
        metricasSaida: [{ alias: "total", expr: "SUM(t.valor)" }],
      }),
    });
    await skills.setStatus(published.id, "publicada");
    const result = await buscar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      query: "saldo faturamentoabcxyz",
    });
    expect(result.cobertura).toBe("parcial");
    expect(result.consultaPermitida).toBe(false);
    expect(result.consultaSemanticaSugerida).toBeUndefined();
    expect(result.hint).toMatch(/sinonimo/);
    expect(result.hint).toMatch(/obter_skill/);
    expect(result.candidatos[0]?.termosAusentes.length).toBeGreaterThan(0);
    expect(result.hint).toMatch(/Termos ausentes/);
  });

  it("segunda SKILL_GAP da mesma pergunta não duplica lacuna", async () => {
    const { buscar, created, aprendizado } = await setup();
    const query = "Qual meu faturamento mensal?";
    await buscar.execute(created.usuarioId, { acessoId: created.acessoId, query });
    await buscar.execute(created.usuarioId, { acessoId: created.acessoId, query });
    const abertas = await aprendizado.listarLacunas(created.acessoId, 20, "aberta");
    expect(abertas).toHaveLength(1);
    expect(abertas[0]?.tipo).toBe("skill_gap");
    expect(abertas[0]?.pergunta).toBe(query);
  });

  it("SKILL_NOT_PUBLISHED arquiva skill_gap da mesma pergunta", async () => {
    const { buscar, created, skills, aprendizado } = await setup();
    const query = "quanto tenho para receber agora";
    await buscar.execute(created.usuarioId, { acessoId: created.acessoId, query });
    expect(await aprendizado.listarLacunas(created.acessoId, 20, "aberta")).toHaveLength(1);
    await skills.create({
      acessoId: created.acessoId,
      slug: "titulos-a-receber",
      nome: "Títulos a receber",
      descricao: "quanto tenho para receber agora",
      sqlModelo: "SELECT r.valor FROM receber r",
      autorUsuarioId: created.usuarioId,
    });
    const result = await buscar.execute(created.usuarioId, { acessoId: created.acessoId, query });
    expect(result.blockingReason).toBe("SKILL_NOT_PUBLISHED");
    expect(result.gap).toBeUndefined();
    expect(await aprendizado.listarLacunas(created.acessoId, 20, "aberta")).toHaveLength(0);
    const arquivadas = await aprendizado.listarLacunas(created.acessoId, 20, "arquivada");
    expect(arquivadas).toHaveLength(1);
    expect(arquivadas[0]?.pergunta).toBe(query);
  });

  it("skill publicada irrelevante devolve SKILL_GAP sem gravar lacuna", async () => {
    const { buscar, created, skills, aprendizado } = await setup();
    const published = await skills.create({
      acessoId: created.acessoId,
      slug: "itens",
      nome: "Itens",
      descricao: "Cadastro de itens",
      sqlModelo: "SELECT p.codprod AS codigo FROM produto p",
      autorUsuarioId: created.usuarioId,
    });
    await skills.setStatus(published.id, "publicada");
    const result = await buscar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      query: "Qual meu faturamento mensal?",
    });
    expect(result.gap?.code).toBe("SKILL_GAP");
    expect(result.consultaPermitida).toBe(false);
    expect(result.fluxoTreino).toBeUndefined();
    expect(result.gap?.hint).toMatch(/listar_skills/);
    expect(result.gap?.hint).not.toMatch(/Não cruze skills/);
    expect(result.gap?.hint).not.toMatch(/sinonimo/);
    expect(result.hint ?? "").not.toMatch(/sinonimo/);
    expect(await aprendizado.listarLacunas(created.acessoId, 20, "aberta")).toHaveLength(0);
  });

  it("inflexão titulos casa cobertura completa no pacote com titulo", async () => {
    const { buscar, created, skills } = await setup();
    const published = await skills.create({
      acessoId: created.acessoId,
      slug: "titulos-abertos",
      nome: "Títulos",
      descricao: "Saldo de titulo comercial",
      sqlModelo: "SELECT t.valor FROM titulo t",
      autorUsuarioId: created.usuarioId,
    });
    await skills.setStatus(published.id, "publicada");
    const result = await buscar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      query: "titulos",
    });
    expect(result.cobertura).toBe("completa");
    expect(result.consultaPermitida).toBe(true);
  });

  it("SKILL_GAP de cruzamento não pede sinônimo nem criar_skill", async () => {
    const { buscar, created, skills } = await setup();
    const receber = await skills.create({
      acessoId: created.acessoId,
      slug: "titulos-a-receber",
      nome: "Títulos a receber",
      descricao: "Saldo em aberto",
      sqlModelo: "SELECT r.valor FROM receber r WHERE r.valor > 0",
      autorUsuarioId: created.usuarioId,
    });
    const pagar = await skills.create({
      acessoId: created.acessoId,
      slug: "titulos-a-pagar",
      nome: "Títulos a pagar",
      descricao: "Saldo em aberto",
      sqlModelo: "SELECT p.valor FROM pagar p WHERE p.valor > 0",
      autorUsuarioId: created.usuarioId,
    });
    await skills.setStatus(receber.id, "publicada");
    await skills.setStatus(pagar.id, "publicada");
    const result = await buscar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      query: "Posso cruzar clientes e fornecedores em uma única consulta?",
    });
    expect(result.consultaPermitida).toBe(false);
    expect(result.gap?.code).toBe("SKILL_GAP");
    expect(result.fluxoTreino).toBeUndefined();
    expect(result.gap?.hint).toMatch(/Não cruze skills/);
    expect(`${result.hint ?? ""} ${result.gap?.hint ?? ""}`).not.toMatch(/sinonimo/);
  });

  it("CAST de data no pacote não vira consultaSemanticaSugerida em pergunta de saldo", async () => {
    const { buscar, created, skills } = await setup();
    const published = await skills.create({
      acessoId: created.acessoId,
      slug: "titulos-a-receber",
      nome: "Títulos a receber",
      descricao: "Quanto tenho para receber",
      sqlModelo:
        "SELECT CAST(r.DataLancamento AS date) AS DataLancamento FROM ContaReceber r WHERE r.SaldoReceber > 0",
      autorUsuarioId: created.usuarioId,
    });
    await skills.update(published.id, {
      escopo: parseEscopoSkill({
        tabelas: ["ContaReceber"],
        colunasPorTabela: { ContaReceber: ["DataLancamento", "SaldoReceber"] },
        metricasSaida: [{ alias: "DataLancamento", expr: "CAST(r.DataLancamento AS date)" }],
      }),
    });
    await skills.setStatus(published.id, "publicada");
    const result = await buscar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      query: "Quanto tenho para receber?",
    });
    expect(result.consultaPermitida).toBe(true);
    expect(result.consultaSemanticaSugerida).toBeUndefined();
  });

  it("pergunta composta devolve fatias e consultaPermitida sem SELECT cruzado", async () => {
    const { buscar, created, skills } = await setup();
    const criar = async (slug: string, nome: string, descricao: string): Promise<void> => {
      const row = await skills.create({
      acessoId: created.acessoId,
        slug,
        nome,
        descricao,
        sqlModelo: "SELECT 1 AS n FROM dual d WHERE d.n > 0",
        autorUsuarioId: created.usuarioId,
      });
      await skills.update(row.id, {
        escopo: parseEscopoSkill({ tabelas: ["dual"], colunasPorTabela: { dual: ["n"] } }),
      });
      await skills.setStatus(row.id, "publicada");
    };
    await criar("vendas", "Vendas", "Vendas do período");
    await criar("titulos-a-receber", "Títulos a receber", "Contas a receber");
    await criar("titulos-a-pagar", "Títulos a pagar", "Contas a pagar");
    const result = await buscar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      query: "visão geral no mês de julho 2026 vendas receber pagar",
    });
    expect(result.cobertura).toBe("composta");
    expect(result.consultaPermitida).toBe(true);
    expect(result.fatias?.length).toBeGreaterThanOrEqual(2);
    expect(result.fatias?.every((f) => f.consultaPermitida)).toBe(true);
    expect(result.hint).toMatch(/fatia/i);
    expect(result.hint).toMatch(/não cruze/i);
  });

  it("estoque do mês sem skill de estoque continua SKILL_GAP", async () => {
    const { buscar, created, skills } = await setup();
    const published = await skills.create({
      acessoId: created.acessoId,
      slug: "listagem-de-produtos",
      nome: "Listagem de produtos",
      descricao: "Listar produtos ativos. Não agrega estoque.",
      sqlModelo: "SELECT p.codprod FROM produto p WHERE p.ativo = :ativo",
      autorUsuarioId: created.usuarioId,
    });
    await skills.update(published.id, {
      escopo: parseEscopoSkill({
        tabelas: ["produto"],
        colunasPorTabela: { produto: ["codprod"] },
      }),
    });
    await skills.setStatus(published.id, "publicada");
    const result = await buscar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      query: "estoque do mês",
    });
    expect(result.consultaPermitida).toBe(false);
    expect(result.gap?.code).toBe("SKILL_GAP");
    expect(result.cobertura).not.toBe("composta");
    const listing = result.candidatos.find((item) => item.slug === "listagem-de-produtos");
    expect(listing?.termosEncontrados ?? []).not.toContain("estoqu");
  });

  it("estoque mínimo do produto não pede sinônimo nem marca estoqu encontrado", async () => {
    const { buscar, created, skills } = await setup();
    const published = await skills.create({
      acessoId: created.acessoId,
      slug: "listagem-de-produtos",
      nome: "Listagem de produtos",
      descricao: "Listar produtos ativos. Não agrega estoque e não autoriza cruzar vendas.",
      sqlModelo: "SELECT p.codprod FROM produto p WHERE p.ativo = :ativo",
      autorUsuarioId: created.usuarioId,
    });
    await skills.update(published.id, {
      escopo: parseEscopoSkill({
        tabelas: ["produto"],
        colunasPorTabela: { produto: ["codprod"] },
      }),
    });
    await skills.setStatus(published.id, "publicada");
    const result = await buscar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      query: "estoque mínimo do produto",
    });
    expect(result.consultaPermitida).toBe(false);
    expect(result.gap?.code).toBe("SKILL_GAP");
    const listing = result.candidatos.find((item) => item.slug === "listagem-de-produtos");
    expect(listing?.termosEncontrados ?? []).not.toContain("estoqu");
    expect(`${result.hint ?? ""} ${result.gap?.hint ?? ""}`).not.toMatch(/sinonimo/);
  });

  it("compras na lista negada da descrição não autoriza a skill de produtos", async () => {
    const { buscar, created, skills } = await setup();
    const criar = async (slug: string, nome: string, descricao: string): Promise<void> => {
      const row = await skills.create({
      acessoId: created.acessoId,
        slug,
        nome,
        descricao,
        sqlModelo: "SELECT 1 AS n FROM dual d WHERE d.n > 0",
        autorUsuarioId: created.usuarioId,
      });
      await skills.update(row.id, {
        escopo: parseEscopoSkill({ tabelas: ["dual"], colunasPorTabela: { dual: ["n"] } }),
      });
      await skills.setStatus(row.id, "publicada");
    };
    await criar("vendas", "Vendas", "Vendas do período");
    await criar("titulos-a-receber", "Títulos a receber", "Contas a receber");
    await criar("titulos-a-pagar", "Títulos a pagar", "Contas a pagar");
    await criar(
      "listagem-de-produtos",
      "Listagem de produtos",
      "Listar produtos ativos. Não agrega estoque e não autoriza cruzar vendas, compras nem títulos.",
    );
    const result = await buscar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      query: "visão geral vendas receber pagar estoque compras",
    });
    const listing = result.candidatos.find((item) => item.slug === "listagem-de-produtos");
    expect(listing?.termosEncontrados ?? []).not.toContain(stemPortugues("compras"));
    expect(listing?.termosEncontrados ?? []).not.toContain(stemPortugues("estoque"));
    expect(listing?.termosAusentes ?? []).toEqual(
      expect.arrayContaining([stemPortugues("compras"), stemPortugues("estoque")]),
    );
    expect(result.cobertura).toBe("composta");
    expect(result.fatias?.some((item) => item.slug === "listagem-de-produtos") ?? false).toBe(
      false,
    );
    expect(result.gap?.code).toBe("SKILL_GAP");
    expect(result.gap?.termosAusentes ?? []).toEqual(
      expect.arrayContaining([stemPortugues("compras"), stemPortugues("estoque")]),
    );
    expect(`${result.hint ?? ""} ${result.gap?.hint ?? ""}`).not.toMatch(/sinonimo/);
  });

  it("listagem certificada sugere IR de dimensões/filtros sem inventar overlay", async () => {
    const { buscar, created, skills } = await setup();
    const published = await skills.create({
      acessoId: created.acessoId,
      slug: "listagem-de-produtos",
      nome: "Listagem de produtos",
      descricao: "Listar produtos ativos",
      sqlModelo: "SELECT p.codprod, p.nome FROM produto p WHERE p.ativo = :ativo",
      params: [{ nome: "ativo", descricao: "Produto ativo", obrigatorio: true, tipo: "string" }],
      autorUsuarioId: created.usuarioId,
    });
    await skills.update(published.id, {
      escopo: parseEscopoSkill({
        tabelas: ["produto"],
        colunasPorTabela: { produto: ["codprod", "nome", "precovenda"] },
        graoResultado: ["codprod"],
        metricasSaida: [{ alias: "PrecoVenda", expr: "p.precovenda" }],
      }),
    });
    await skills.setStatus(published.id, "publicada");
    const result = await buscar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      query: "listar produtos ativos",
    });
    expect(result.consultaPermitida).toBe(true);
    expect(result.consultaSemanticaSugerida).toMatchObject({
      versao: 1,
      modo: "listagem",
      dimensoes: ["codprod"],
    });
    expect(result.consultaSemanticaSugerida?.metrica).toBeUndefined();
    expect(result.consultaSemanticaSugerida?.filtros).toEqual([
      { coluna: "ativo", op: "=", param: "ativo" },
    ]);
    expect(result.metricasSemOverlay).toBeUndefined();
  });
});
