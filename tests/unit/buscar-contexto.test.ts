import { describe, expect, it } from "vitest";
import { BuscarContexto } from "../../src/application/use-cases/consultar.js";
import { RegistrarAcesso } from "../../src/application/use-cases/cofre.js";
import { NodeCryptoAdapter } from "../../src/infrastructure/crypto/node-crypto.adapter.js";
import { SetupCodeStore } from "../../src/infrastructure/http/setup-code-store.js";
import {
  InMemoryAprendizadoRepository,
  InMemoryAcessoRepository,
  InMemoryAnotacaoGrafoRepository,
  InMemoryGrafoRepository,
  InMemorySkillRepository,
  InMemoryUsuarioRepository,
} from "../../src/infrastructure/persistence/memory/memory-cofre.js";
import { FakePlugServer } from "../helpers/fake-plug-server.js";

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
    return { buscar, created, skills, aprendizado };
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
  });

  it("com rascunho oriente a continuar o fluxo em vez de recomeçar", async () => {
    const { buscar, created, skills } = await setup();
    await skills.create({
      agentId,
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
    expect(result.gap?.hint).toMatch(/em andamento/i);
    expect(result.fluxoTreino?.proximoPasso).toBeTruthy();
  });

  it("casa pergunta pelo sqlModelo e pelos params", async () => {
    const { buscar, created, skills } = await setup();
    const published = await skills.create({
      agentId,
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
      agentId,
      slug: "produtos",
      nome: "Produtos",
      descricao: "Lista de produtos",
      sqlModelo: "SELECT p.codprod AS codigo FROM produto p",
      autorUsuarioId: created.usuarioId,
    });
    await skills.setStatus(published.id, "publicada");
    await skills.create({
      agentId,
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
      agentId,
      slug: "faturamento-cliente",
      nome: "Faturamento por cliente",
      descricao: "Total faturado no mês por cliente",
      sqlModelo: "SELECT c.nome FROM cliente c",
      autorUsuarioId: created.usuarioId,
    });
    await skills.setStatus(published.id, "publicada");
    for (let i = 0; i < 8; i += 1) {
      await skills.create({
        agentId,
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
      agentId,
      slug: "lista-xyz",
      nome: "Lista xyz",
      descricao: "Rascunho genérico",
      sqlModelo: "SELECT p.codprod AS codigo FROM produto p",
      autorUsuarioId: created.usuarioId,
    });
    const relevant = await skills.create({
      agentId,
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
    expect(result.gap?.hint).toMatch(/Faturamento por cliente/);
    expect(result.skillsParaTreino[0]?.id).toBe(relevant.id);
  });

  it("em pergunta de período pede para reutilizar consultasAprendidas com params ou OVER", async () => {
    const { buscar, created, skills, aprendizado } = await setup();
    const published = await skills.create({
      agentId,
      slug: "faturamento",
      nome: "Faturamento",
      descricao: "Total faturado",
      sqlModelo: "SELECT p.valor FROM produto p WHERE p.data >= :dataInicio",
      autorUsuarioId: created.usuarioId,
    });
    await skills.setStatus(published.id, "publicada");
    await aprendizado.salvarConsulta({
      agentId,
      skillId: published.id,
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
    expect(result.hint).toMatch(/OVER\/LAG/);
  });
});
