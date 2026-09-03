import { describe, expect, it } from "vitest";
import { RegistrarAcesso } from "../../src/application/use-cases/cofre.js";
import {
  CriarSkill,
  PublicarSkill,
  ValidarSkill,
  ConfirmarColuna,
  ConfirmarRelacionamento,
} from "../../src/application/use-cases/skills.js";
import { NodeCryptoAdapter } from "../../src/infrastructure/crypto/node-crypto.adapter.js";
import { SetupCodeStore } from "../../src/infrastructure/http/setup-code-store.js";
import {
  InMemoryAcessoRepository,
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
    await seedTabelaComColunas(grafo, {
      acessoId: created.acessoId,
      usuarioId: created.usuarioId,
      nome: "produto",
      colunas: ["codprod"],
    });
    const produto = await grafo.findTabelaByNome(created.acessoId, "produto");
    await grafo.mergeColuna({
      acessoId: created.acessoId,
      tabelaId: produto!.id,
      nome: "dtcad",
      origem: "validado_execucao",
      autorUsuarioId: created.usuarioId,
    });
    const sessions = {
      getAccessToken: async () => "access-test",
      invalidate: () => undefined,
      remember: () => undefined,
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

  it("revalidar skill publicada não despublica", async () => {
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
    await seedTabelaComColunas(grafo, {
      acessoId: created.acessoId,
      usuarioId: created.usuarioId,
      nome: "produto",
      colunas: ["codprod", "dtcad"],
    });
    const sessions = {
      getAccessToken: async () => "access-test",
      invalidate: () => undefined,
      remember: () => undefined,
    };
    const criar = new CriarSkill(acessos, skills, grafo);
    const validar = new ValidarSkill(acessos, skills, plug, sessions, crypto, grafo);
    const publicar = new PublicarSkill(acessos, skills, grafo);
    const skill = await criar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      slug: "produtos",
      nome: "Produtos",
      descricao: "Lista",
      sqlModelo: "SELECT p.codprod AS codigo FROM produto p WHERE p.codprod > 0",
    });
    await validar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      skillId: skill.skill.id,
    });
    await publicar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      skillId: skill.skill.id,
      confirmadoPeloUsuario: true,
    });
    const revalidada = await validar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      skillId: skill.skill.id,
    });
    expect(revalidada.skill.status).toBe("publicada");
    expect(revalidada.statusPreservado).toBe(true);
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
    await seedTabelaComColunas(grafo, {
      acessoId: created.acessoId,
      usuarioId: created.usuarioId,
      nome: "produto",
      colunas: ["codprod", "dtcad"],
    });
    const sessions = {
      getAccessToken: async () => "access-test",
      invalidate: () => undefined,
      remember: () => undefined,
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

  it("enriquecer=completo perfila o sqlModelo sem desfazer a validação", async () => {
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
    await seedTabelaComColunas(grafo, {
      acessoId: created.acessoId,
      usuarioId: created.usuarioId,
      nome: "produto",
      colunas: ["codprod"],
    });
    const produto = await grafo.findTabelaByNome(created.acessoId, "produto");
    await grafo.mergeColuna({
      acessoId: created.acessoId,
      tabelaId: produto!.id,
      nome: "dtcad",
      origem: "validado_execucao",
      autorUsuarioId: created.usuarioId,
    });
    const sessions = {
      getAccessToken: async () => "access-test",
      invalidate: () => undefined,
      remember: () => undefined,
    };
    const criar = new CriarSkill(acessos, skills, grafo);
    const validar = new ValidarSkill(acessos, skills, plug, sessions, crypto, grafo);
    const skill = await criar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      nome: "Produtos",
      descricao: "Lista",
      sqlModelo: "SELECT p.codprod AS codigo FROM produto p WHERE p.dtcad >= :dataInicio",
      params: [{ nome: "dataInicio", descricao: "Data inicial" }],
    });
    plug.sqlImpl = async (sql: string) => {
      if (/column_name/i.test(sql) || /syscolumns/i.test(sql)) {
        return {
          columns: ["column_name", "data_type"],
          rows: [
            { column_name: "codprod", data_type: "int" },
            { column_name: "dtcad", data_type: "datetime" },
          ],
        };
      }
      if (/MIN\(/i.test(sql)) {
        return {
          columns: ["min_v", "max_v", "nulos", "total", "distintos"],
          rows: [{ min_v: 1, max_v: 9, nulos: 0, total: 10, distintos: 10 }],
        };
      }
      return { columns: ["ok"], rows: [{ ok: 1 }] };
    };
    const result = await validar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      skillId: skill.skill.id,
      enriquecer: "completo",
    });
    expect(result.skill.status).toBe("validada");
    const tabela = await grafo.findTabelaByNome(created.acessoId, "produto");
    const cols = tabela ? await grafo.listColunas(created.acessoId, tabela.id) : [];
    expect(
      cols.some((coluna) => coluna.nome.toLowerCase() === "codprod" && coluna.tipo === "int"),
    ).toBe(true);
    expect(
      cols.some((coluna) => coluna.nome.toLowerCase() === "dtcad" && coluna.tipo === "datetime"),
    ).toBe(true);
  });

  it("união do pacote: coluna e JOIN fora do sqlModelo sobrevivem a validar_skill", async () => {
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
    await seedTabelaComColunas(grafo, {
      acessoId: created.acessoId,
      usuarioId: created.usuarioId,
      nome: "produto",
      colunas: ["codprod", "nome"],
    });
    await seedTabelaComColunas(grafo, {
      acessoId: created.acessoId,
      usuarioId: created.usuarioId,
      nome: "anexo",
      colunas: ["codprod", "imagem"],
    });
    const sessions = {
      getAccessToken: async () => "access-test",
      invalidate: () => undefined,
      remember: () => undefined,
    };
    const criar = new CriarSkill(acessos, skills, grafo);
    const skill = await criar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      nome: "Produtos",
      descricao: "Lista",
      sqlModelo: "SELECT p.codprod AS codigo FROM produto p WHERE p.codprod > 0",
    });
    await new ConfirmarColuna(acessos, grafo, skills).execute(created.usuarioId, {
      acessoId: created.acessoId,
      skillId: skill.skill.id,
      colunas: [{ tabela: "anexo", coluna: "imagem" }],
      confirmadoPeloUsuario: true,
    });
    await new ConfirmarRelacionamento(acessos, grafo, skills).execute(created.usuarioId, {
      acessoId: created.acessoId,
      skillId: skill.skill.id,
      tabelaOrigem: "produto",
      tabelaDestino: "anexo",
      pares: [{ colunaOrigem: "codprod", colunaDestino: "codprod" }],
      tipoJoin: "left",
      cardinalidade: "1:N",
    });
    const before = await skills.findById(skill.skill.id);
    expect(before?.escopo.tabelas.map((n) => n.toLowerCase())).toEqual(
      expect.arrayContaining(["produto", "anexo"]),
    );
    await new ValidarSkill(acessos, skills, plug, sessions, crypto, grafo).execute(
      created.usuarioId,
      { acessoId: created.acessoId, skillId: skill.skill.id },
    );
    const after = await skills.findById(skill.skill.id);
    expect(after?.escopo.tabelas.map((n) => n.toLowerCase())).toEqual(
      expect.arrayContaining(["produto", "anexo"]),
    );
    expect(after?.escopo.colunasPorTabela.anexo ?? after?.escopo.colunasPorTabela.Anexo).toEqual(
      expect.arrayContaining(["imagem"]),
    );
    expect(
      after?.escopo.relacionamentos.some(
        (rel) =>
          rel.tabelaOrigem.toLowerCase() === "produto" &&
          rel.tabelaDestino.toLowerCase() === "anexo" &&
          rel.cardinalidade === "1:N",
      ),
    ).toBe(true);
    expect(after?.sqlModelo).toBe(skill.skill.sqlModelo);
  });

  it("validar_skill não puxa JOIN só inferido no grafo que nunca entrou no pacote", async () => {
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
    await seedTabelaComColunas(grafo, {
      acessoId: created.acessoId,
      usuarioId: created.usuarioId,
      nome: "produto",
      colunas: ["codprod"],
    });
    await seedTabelaComColunas(grafo, {
      acessoId: created.acessoId,
      usuarioId: created.usuarioId,
      nome: "transportadora",
      colunas: ["codprod"],
    });
    const produto = await grafo.findTabelaByNome(created.acessoId, "produto");
    const transportadora = await grafo.findTabelaByNome(created.acessoId, "transportadora");
    await grafo.mergeRelacionamento({
      acessoId: created.acessoId,
      tabelaOrigemId: produto!.id,
      tabelaDestinoId: transportadora!.id,
      pares: [{ colunaOrigem: "codprod", colunaDestino: "codprod" }],
      tipoJoin: "inner",
      origem: "inferido",
      autorUsuarioId: created.usuarioId,
    });
    const sessions = {
      getAccessToken: async () => "access-test",
      invalidate: () => undefined,
      remember: () => undefined,
    };
    const skill = await new CriarSkill(acessos, skills, grafo).execute(created.usuarioId, {
      acessoId: created.acessoId,
      nome: "Produtos",
      descricao: "Lista",
      sqlModelo: "SELECT p.codprod AS codigo FROM produto p WHERE p.codprod > 0",
    });
    await new ValidarSkill(acessos, skills, plug, sessions, crypto, grafo).execute(
      created.usuarioId,
      { acessoId: created.acessoId, skillId: skill.skill.id },
    );
    const after = await skills.findById(skill.skill.id);
    expect(after?.escopo.tabelas.map((n) => n.toLowerCase())).toEqual(["produto"]);
    expect(after?.escopo.relacionamentos).toHaveLength(0);
  });

  it("confirmar_coluna livre sobrevive a validar_skill enriquecer=completo", async () => {
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
    await seedTabelaComColunas(grafo, {
      acessoId: created.acessoId,
      usuarioId: created.usuarioId,
      nome: "produto",
      colunas: ["codprod", "nome"],
    });
    const produto = await grafo.findTabelaByNome(created.acessoId, "produto");
    await grafo.mergeColuna({
      acessoId: created.acessoId,
      tabelaId: produto!.id,
      nome: "nome",
      origem: "inferido",
      autorUsuarioId: created.usuarioId,
      sensibilidade: "pessoal",
    });
    const sessions = {
      getAccessToken: async () => "access-test",
      invalidate: () => undefined,
      remember: () => undefined,
    };
    const criar = new CriarSkill(acessos, skills, grafo);
    const skill = await criar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      nome: "Produtos",
      descricao: "Lista",
      sqlModelo: "SELECT p.codprod, p.nome FROM produto p WHERE p.codprod > 0",
    });
    await new ConfirmarColuna(acessos, grafo, skills).execute(created.usuarioId, {
      acessoId: created.acessoId,
      skillId: skill.skill.id,
      tabela: "produto",
      coluna: "nome",
      sensibilidade: "livre",
      confirmadoPeloUsuario: true,
    });
    plug.sqlImpl = async (sql: string) => {
      if (/column_name/i.test(sql) || /syscolumns/i.test(sql)) {
        return {
          columns: ["column_name", "data_type"],
          rows: [
            { column_name: "codprod", data_type: "int" },
            { column_name: "nome", data_type: "varchar" },
          ],
        };
      }
      if (/MIN\(/i.test(sql)) {
        return {
          columns: ["min_v", "max_v", "nulos", "total", "distintos"],
          rows: [{ min_v: "A", max_v: "Z", nulos: 0, total: 10, distintos: 10 }],
        };
      }
      return { columns: ["ok"], rows: [{ ok: 1 }] };
    };
    await new ValidarSkill(acessos, skills, plug, sessions, crypto, grafo).execute(
      created.usuarioId,
      { acessoId: created.acessoId, skillId: skill.skill.id, enriquecer: "completo" },
    );
    const coluna = await grafo.findColuna(created.acessoId, produto!.id, "nome");
    expect(coluna?.sensibilidade).toBe("livre");
  });
});
