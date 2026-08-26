import { describe, expect, it } from "vitest";
import { ObterSkill } from "../../src/application/use-cases/skills.js";
import { ConsultarDados, ValidarConsulta } from "../../src/application/use-cases/consultar.js";
import { RegistrarAcesso } from "../../src/application/use-cases/cofre.js";
import { escopoVazio } from "../../src/domain/entities/escopo.js";
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

describe("obter_skill pacote e backfill de escopo", () => {
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
    const obter = new ObterSkill(
      acessos,
      skills,
      grafo,
      anotacoes,
      plug,
      sessions,
      crypto,
      aprendizado,
    );
    return { plug, acessos, skills, grafo, aprendizado, obter, created, sessions };
  };

  it("persiste escopo vazio e devolve consultasExemplo", async () => {
    const { skills, aprendizado, obter, created } = await setup();
    const skill = await skills.create({
      agentId,
      slug: "produtos",
      nome: "Produtos",
      descricao: "Lista",
      sqlModelo: "SELECT p.codprod AS codigo FROM produto p",
      autorUsuarioId: created.usuarioId,
    });
    expect(skill.escopo).toEqual(escopoVazio());
    await aprendizado.salvarConsulta({
      agentId,
      skillIds: [skill.id],
      pergunta: "produtos ativos",
      sql: "SELECT p.codprod FROM produto p WHERE p.codprod > 0",
      paramsContrato: [],
      autorUsuarioId: created.usuarioId,
    });
    const result = await obter.execute(created.usuarioId, {
      acessoId: created.acessoId,
      skillId: skill.id,
    });
    expect(result.pacote.escopo.tabelas.map((t) => t.toLowerCase())).toContain("produto");
    expect(result.pacote.consultasExemplo).toHaveLength(1);
    const reloaded = await skills.findById(skill.id);
    expect(reloaded?.escopo.tabelas.map((t) => t.toLowerCase())).toContain("produto");
  });

  it("validar_consulta liga placeholders a null", async () => {
    const { plug, acessos, skills, created, sessions } = await setup();
    const skill = await skills.create({
      agentId,
      slug: "por-codigo",
      nome: "Produto",
      descricao: "Busca",
      sqlModelo: "SELECT p.codprod AS codigo FROM produto p WHERE p.codprod = :codigo",
      autorUsuarioId: created.usuarioId,
    });
    await skills.setStatus(skill.id, "publicada");
    const validar = new ValidarConsulta(acessos, skills, plug, sessions, crypto);
    const result = await validar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      skillId: skill.id,
      sql: "SELECT p.codprod AS codigo FROM produto p WHERE p.codprod = :codigo",
    });
    expect(result.valido).toBe(true);
    expect(plug.lastParams).toEqual({ codigo: null });
  });

  it("consultar_dados persiste escopo vazio", async () => {
    const { plug, acessos, skills, created, sessions } = await setup();
    plug.sqlImpl = async () => ({ columns: ["codigo"], rows: [{ codigo: 1 }] });
    const skill = await skills.create({
      agentId,
      slug: "lista",
      nome: "Lista",
      descricao: "Produtos",
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
      new InMemoryAuditLog(),
      500,
      5000,
    );
    await consultar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      skillId: skill.id,
      pergunta: "consulta de teste",
    });
    const reloaded = await skills.findById(skill.id);
    expect(reloaded?.escopo.tabelas.map((t) => t.toLowerCase())).toContain("produto");
  });

  it("pacote só autoriza colunas do escopo", async () => {
    const { skills, grafo, obter, created } = await setup();
    const { tabela } = await grafo.mergeTabela({
      agentId,
      nome: "produto",
      origem: "validado_execucao",
      autorUsuarioId: created.usuarioId,
    });
    await grafo.mergeColuna({
      tabelaId: tabela.id,
      nome: "codprod",
      tipo: "int",
      origem: "validado_execucao",
      autorUsuarioId: created.usuarioId,
    });
    await grafo.mergeColuna({
      tabelaId: tabela.id,
      nome: "secreto",
      tipo: "int",
      origem: "validado_execucao",
      autorUsuarioId: created.usuarioId,
    });
    const skill = await skills.create({
      agentId,
      slug: "produtos",
      nome: "Produtos",
      descricao: "Lista",
      sqlModelo: "SELECT p.codprod AS codigo FROM produto p WHERE p.codprod > 0",
      autorUsuarioId: created.usuarioId,
    });
    const result = await obter.execute(created.usuarioId, {
      acessoId: created.acessoId,
      skillId: skill.id,
    });
    expect(result.pacote.colunas.map((col) => col.nome.toLowerCase())).toEqual(["codprod"]);
    expect(result.pacote.colunas.some((col) => col.nome.toLowerCase() === "secreto")).toBe(false);
  });
});
