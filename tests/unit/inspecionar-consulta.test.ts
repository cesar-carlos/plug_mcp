import { describe, expect, it } from "vitest";
import {
  InspecionarConsulta,
  DescobrirTabela,
  INSPECAO_MAX_ROWS,
} from "../../src/application/use-cases/inspecionar.js";
import { RegistrarAcesso } from "../../src/application/use-cases/cofre.js";
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
import { ERROR_CODES } from "../../src/domain/errors/error-codes.js";
import { escopoFromSqlModelo } from "../../src/application/use-cases/shared/escopo-from-modelo.js";
import { parseSqlModelo } from "../../src/application/use-cases/shared/sql-modelo.js";

const crypto = new NodeCryptoAdapter(
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
);
const agentId = "11111111-1111-4111-8111-111111111111";

describe("inspecionar_consulta", () => {
  it("teto 100, amostra crua e recusa sem finalidade", async () => {
    const plug = new FakePlugServer();
    plug.approve(agentId);
    const usuarios = new InMemoryUsuarioRepository();
    const acessos = new InMemoryAcessoRepository();
    const grafo = new InMemoryGrafoRepository();
    const skills = new InMemorySkillRepository();
    const audit = new InMemoryAuditLog();
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
      dialeto: "mssql",
      clientToken: "tok-sql-123456",
    });
    const sessions = {
      getAccessToken: async () => "access-test",
      invalidate: () => undefined,
      remember: () => undefined,
    };
    const sqlModelo = "SELECT c.codcli, c.nome, c.senha FROM cliente c WHERE c.codcli > 0";
    const skill = await skills.create({
      acessoId: created.acessoId,
      slug: "clientes",
      nome: "Clientes",
      descricao: "cadastro",
      sqlModelo,
      escopo: escopoFromSqlModelo(parseSqlModelo(sqlModelo)),
      autorUsuarioId: created.usuarioId,
    });
    await skills.setStatus(skill.id, "publicada");
    plug.sqlImpl = async () => ({
      columns: ["codcli", "nome", "senha"],
      columnsMetadata: [
        { name: "codcli", type: "int", nullable: false },
        { name: "nome", type: "varchar", nullable: true },
        { name: "senha", type: "varchar", nullable: true },
      ],
      rows: Array.from({ length: 120 }, (_, i) => ({
        codcli: i + 1,
        nome: "Pessoa",
        senha: "segredo-raw",
      })),
    });
    const inspecionar = new InspecionarConsulta(
      acessos,
      skills,
      grafo,
      plug,
      sessions,
      crypto,
      audit,
    );
    await expect(
      inspecionar.execute(created.usuarioId, {
        acessoId: created.acessoId,
        skillId: skill.id,
        sql: sqlModelo,
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_ERROR });

    const comSegredo = await inspecionar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      skillId: skill.id,
      sql: "SELECT c.codcli, c.senha FROM cliente c WHERE c.codcli > 0",
      finalidade: "amostra_estrutura",
    });
    expect(comSegredo.rows[0]?.senha).toBe("segredo-raw");
    expect(comSegredo.colunasMascaradas).toEqual([]);

    plug.sqlImpl = async () => ({
      columns: ["codcli", "nome"],
      columnsMetadata: [
        { name: "codcli", type: "int", nullable: false },
        { name: "nome", type: "varchar", nullable: true },
      ],
      rows: Array.from({ length: 120 }, (_, i) => ({
        codcli: i + 1,
        nome: "Pessoa",
      })),
    });

    const result = await inspecionar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      skillId: skill.id,
      sql: "SELECT c.codcli, c.nome FROM cliente c WHERE c.codcli > 0",
      finalidade: "amostra_estrutura",
    });
    expect(result.maxRowsApplied).toBe(INSPECAO_MAX_ROWS);
    expect(result.rowCount).toBeLessThanOrEqual(INSPECAO_MAX_ROWS);
    expect(result.rows[0]?.nome).toBe("Pessoa");
    expect(result.colunasMascaradas).toEqual([]);
    expect(audit.entries.every((entry) => !String(entry.sqlEnviado).includes("Pessoa"))).toBe(true);
    expect(result.columnsMetadata).toEqual([
      { name: "codcli", type: "int", nullable: false },
      { name: "nome", type: "varchar", nullable: true },
    ]);
  });

  it("Firebird inspeciona só a consulta exemplo, sem SQL livre", async () => {
    const fbAgent = "22222222-2222-4222-8222-222222222222";
    const plug = new FakePlugServer();
    plug.approve(fbAgent);
    const usuarios = new InMemoryUsuarioRepository();
    const acessos = new InMemoryAcessoRepository();
    const grafo = new InMemoryGrafoRepository();
    const skills = new InMemorySkillRepository();
    const audit = new InMemoryAuditLog();
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
    const sqlModelo = "SELECT c.codcli, c.nome FROM cliente c WHERE c.codcli > 0";
    const skill = await skills.create({
      acessoId: created.acessoId,
      slug: "clientes-fb",
      nome: "Clientes FB",
      descricao: "cadastro",
      sqlModelo,
      escopo: escopoFromSqlModelo(parseSqlModelo(sqlModelo)),
      autorUsuarioId: created.usuarioId,
    });
    await skills.setStatus(skill.id, "publicada");
    plug.sqlImpl = async () => ({
      columns: ["codcli", "nome"],
      rows: [{ codcli: 1, nome: "Pessoa" }],
    });
    const inspecionar = new InspecionarConsulta(
      acessos,
      skills,
      grafo,
      plug,
      sessions,
      crypto,
      audit,
    );
    await expect(
      inspecionar.execute(created.usuarioId, {
        acessoId: created.acessoId,
        skillId: skill.id,
        sql: sqlModelo,
        finalidade: "amostra_estrutura",
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.DIALECT_UNSUPPORTED, source: "sql" });

    const result = await inspecionar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      skillId: skill.id,
      finalidade: "amostra_estrutura",
    });
    expect(result.maxRowsApplied).toBe(INSPECAO_MAX_ROWS);
    expect(result.rowCount).toBe(1);
    expect(result.rows[0]?.nome).toBe("Pessoa");
    expect(plug.lastSql).toMatch(/cliente/i);
  });

  it("aceita skill validada e recusa rascunho", async () => {
    const plug = new FakePlugServer();
    plug.approve(agentId);
    const usuarios = new InMemoryUsuarioRepository();
    const acessos = new InMemoryAcessoRepository();
    const grafo = new InMemoryGrafoRepository();
    const skills = new InMemorySkillRepository();
    const audit = new InMemoryAuditLog();
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
      dialeto: "mssql",
      clientToken: "tok-sql-123456",
    });
    const sessions = {
      getAccessToken: async () => "access-test",
      invalidate: () => undefined,
      remember: () => undefined,
    };
    const sqlModelo = "SELECT c.codcli AS codigo FROM cliente c WHERE c.codcli > 0";
    const rascunho = await skills.create({
      acessoId: created.acessoId,
      slug: "clientes-rascunho",
      nome: "Clientes rascunho",
      descricao: "cadastro",
      sqlModelo,
      escopo: escopoFromSqlModelo(parseSqlModelo(sqlModelo)),
      autorUsuarioId: created.usuarioId,
    });
    const validada = await skills.create({
      acessoId: created.acessoId,
      slug: "clientes-validada",
      nome: "Clientes validada",
      descricao: "cadastro",
      sqlModelo,
      escopo: escopoFromSqlModelo(parseSqlModelo(sqlModelo)),
      autorUsuarioId: created.usuarioId,
    });
    await skills.setStatus(validada.id, "validada");
    plug.sqlImpl = async () => ({ columns: ["codigo"], rows: [{ codigo: 1 }] });
    const inspecionar = new InspecionarConsulta(
      acessos,
      skills,
      grafo,
      plug,
      sessions,
      crypto,
      audit,
    );
    await expect(
      inspecionar.execute(created.usuarioId, {
        acessoId: created.acessoId,
        skillId: rascunho.id,
        finalidade: "amostra_estrutura",
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.SKILL_NOT_PUBLISHED });
    const result = await inspecionar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      skillId: validada.id,
      finalidade: "amostra_estrutura",
    });
    expect(result.rowCount).toBe(1);
  });

  it("aceita SELECT * sem WHERE, injeta TOP e grava colunas novas no grafo", async () => {
    const plug = new FakePlugServer();
    plug.approve(agentId);
    const usuarios = new InMemoryUsuarioRepository();
    const acessos = new InMemoryAcessoRepository();
    const grafo = new InMemoryGrafoRepository();
    const skills = new InMemorySkillRepository();
    const audit = new InMemoryAuditLog();
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
      dialeto: "mssql",
      clientToken: "tok-sql-123456",
    });
    const sessions = {
      getAccessToken: async () => "access-test",
      invalidate: () => undefined,
      remember: () => undefined,
    };
    const sqlModelo = "SELECT c.codcli FROM cliente c WHERE c.codcli > 0";
    const skill = await skills.create({
      acessoId: created.acessoId,
      slug: "clientes-star",
      nome: "Clientes star",
      descricao: "cadastro",
      sqlModelo,
      escopo: escopoFromSqlModelo(parseSqlModelo(sqlModelo)),
      autorUsuarioId: created.usuarioId,
    });
    await skills.setStatus(skill.id, "publicada");
    plug.sqlImpl = async () => ({
      columns: ["codcli", "nome", "ativo"],
      columnsMetadata: [
        { name: "codcli", type: "int", nullable: false },
        { name: "nome", type: "varchar", nullable: true },
        { name: "ativo", type: "bit", nullable: false },
      ],
      rows: [{ codcli: 1, nome: "Pessoa", ativo: true }],
    });
    const inspecionar = new InspecionarConsulta(
      acessos,
      skills,
      grafo,
      plug,
      sessions,
      crypto,
      audit,
    );
    const result = await inspecionar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      skillId: skill.id,
      sql: "SELECT * FROM cliente",
      finalidade: "amostra_estrutura",
    });
    expect(plug.lastSql).toMatch(/TOP\s+100/i);
    expect(result.rows[0]?.nome).toBe("Pessoa");
    expect(result.colunasNovasNoGrafo).toEqual(expect.arrayContaining(["codcli", "nome", "ativo"]));
    expect(result.hint).toMatch(/confirmar_coluna/);
    expect(result.hint).not.toMatch(/republicar/);
    const tabela = await grafo.findTabelaByNome(created.acessoId, "cliente");
    expect(tabela).not.toBeNull();
    const cols = await grafo.listColunas(created.acessoId, tabela!.id);
    expect(cols.map((coluna) => coluna.nome)).toEqual(
      expect.arrayContaining(["codcli", "nome", "ativo"]),
    );
  });

  it("param tabela gera SELECT * cortado; tabela de outra skill publicada entra", async () => {
    const plug = new FakePlugServer();
    plug.approve(agentId);
    const usuarios = new InMemoryUsuarioRepository();
    const acessos = new InMemoryAcessoRepository();
    const grafo = new InMemoryGrafoRepository();
    const skills = new InMemorySkillRepository();
    const audit = new InMemoryAuditLog();
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
      dialeto: "mssql",
      clientToken: "tok-sql-123456",
    });
    const sessions = {
      getAccessToken: async () => "access-test",
      invalidate: () => undefined,
      remember: () => undefined,
    };
    const skillCliente = await skills.create({
      acessoId: created.acessoId,
      slug: "clientes-nav",
      nome: "Clientes",
      descricao: "cadastro",
      sqlModelo: "SELECT c.codcli FROM cliente c WHERE c.codcli > 0",
      escopo: escopoFromSqlModelo(
        parseSqlModelo("SELECT c.codcli FROM cliente c WHERE c.codcli > 0"),
      ),
      autorUsuarioId: created.usuarioId,
    });
    const skillProduto = await skills.create({
      acessoId: created.acessoId,
      slug: "produtos-nav",
      nome: "Produtos",
      descricao: "cadastro",
      sqlModelo: "SELECT p.codprod FROM produto p WHERE p.codprod > 0",
      escopo: escopoFromSqlModelo(
        parseSqlModelo("SELECT p.codprod FROM produto p WHERE p.codprod > 0"),
      ),
      autorUsuarioId: created.usuarioId,
    });
    await skills.setStatus(skillCliente.id, "publicada");
    await skills.setStatus(skillProduto.id, "publicada");
    plug.sqlImpl = async () => ({
      columns: ["codprod"],
      rows: [{ codprod: 9 }],
    });
    const inspecionar = new InspecionarConsulta(
      acessos,
      skills,
      grafo,
      plug,
      sessions,
      crypto,
      audit,
    );
    const result = await inspecionar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      skillId: skillCliente.id,
      tabela: "produto",
      finalidade: "validar_tipo",
    });
    expect(plug.lastSql).toMatch(/FROM\s+produto/i);
    expect(plug.lastSql).toMatch(/TOP\s+100/i);
    expect(result.rowCount).toBe(1);
  });

  it("recusa SELECT * com JOIN inventado", async () => {
    const plug = new FakePlugServer();
    plug.approve(agentId);
    const usuarios = new InMemoryUsuarioRepository();
    const acessos = new InMemoryAcessoRepository();
    const grafo = new InMemoryGrafoRepository();
    const skills = new InMemorySkillRepository();
    const audit = new InMemoryAuditLog();
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
      dialeto: "mssql",
      clientToken: "tok-sql-123456",
    });
    const sessions = {
      getAccessToken: async () => "access-test",
      invalidate: () => undefined,
      remember: () => undefined,
    };
    const sqlModelo = "SELECT c.codcli FROM cliente c WHERE c.codcli > 0";
    const skill = await skills.create({
      acessoId: created.acessoId,
      slug: "clientes-join",
      nome: "Clientes",
      descricao: "cadastro",
      sqlModelo,
      escopo: escopoFromSqlModelo(parseSqlModelo(sqlModelo)),
      autorUsuarioId: created.usuarioId,
    });
    await skills.setStatus(skill.id, "publicada");
    const inspecionar = new InspecionarConsulta(
      acessos,
      skills,
      grafo,
      plug,
      sessions,
      crypto,
      audit,
    );
    await expect(
      inspecionar.execute(created.usuarioId, {
        acessoId: created.acessoId,
        skillId: skill.id,
        sql: "SELECT * FROM cliente c INNER JOIN alien x ON x.id = c.codcli",
        finalidade: "verificar_join",
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.INVALID_SQL });
  });
});

describe("descobrir_tabela", () => {
  it("omite título de anotação misturado como coluna", async () => {
    const plug = new FakePlugServer();
    plug.approve(agentId);
    const usuarios = new InMemoryUsuarioRepository();
    const acessos = new InMemoryAcessoRepository();
    const grafo = new InMemoryGrafoRepository();
    const skills = new InMemorySkillRepository();
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
      email: "disc@b.com",
      senha: "secret-pass",
      agentId,
      dialeto: "mssql",
      clientToken: "tok-sql-123456",
    });
    const sessions = {
      getAccessToken: async () => "access-test",
      invalidate: () => undefined,
      remember: () => undefined,
    };
    const sqlModelo = "SELECT p.DataPagamento, p.ValorPago FROM ContaPagar p WHERE p.ValorPago > 0";
    const skill = await skills.create({
      acessoId: created.acessoId,
      slug: "titulos-a-pagar",
      nome: "Títulos a pagar",
      descricao: "pagar",
      sqlModelo,
      escopo: escopoFromSqlModelo(parseSqlModelo(sqlModelo)),
      autorUsuarioId: created.usuarioId,
    });
    await skills.setStatus(skill.id, "publicada");
    const tabela = await grafo.mergeTabela({
      acessoId: created.acessoId,
      nome: "ContaPagar",
      origem: "validado_execucao",
      autorUsuarioId: created.usuarioId,
    });
    await grafo.mergeColuna({
      acessoId: created.acessoId,
      tabelaId: tabela.tabela.id,
      nome: "DataPagamento",
      tipo: "datetime",
      origem: "validado_execucao",
      autorUsuarioId: created.usuarioId,
    });
    await grafo.mergeColuna({
      acessoId: created.acessoId,
      tabelaId: tabela.tabela.id,
      nome: "ValorPago",
      tipo: "numeric",
      origem: "validado_execucao",
      autorUsuarioId: created.usuarioId,
    });
    await grafo.mergeColuna({
      acessoId: created.acessoId,
      tabelaId: tabela.tabela.id,
      nome: "Status / Situacao pagar",
      origem: "inferido",
      autorUsuarioId: created.usuarioId,
    });
    const descobrir = new DescobrirTabela(acessos, skills, grafo, plug, sessions, crypto);
    const result = await descobrir.execute(created.usuarioId, {
      acessoId: created.acessoId,
      tabela: "ContaPagar",
    });
    expect(result.colunas.map((coluna) => coluna.nome)).toEqual(["DataPagamento", "ValorPago"]);
    expect(result.colunas.some((coluna) => coluna.nome.includes("/"))).toBe(false);
  });

  it("recorta colunas e arestas ao pacote publicado, não à vizinhança extra do grafo", async () => {
    const plug = new FakePlugServer();
    plug.approve(agentId);
    const usuarios = new InMemoryUsuarioRepository();
    const acessos = new InMemoryAcessoRepository();
    const grafo = new InMemoryGrafoRepository();
    const skills = new InMemorySkillRepository();
    const created = await new RegistrarAcesso(
      usuarios,
      acessos,
      plug,
      crypto,
      new SetupCodeStore(),
      "http://localhost",
      0,
    ).execute({
      email: "disc2@b.com",
      senha: "secret-pass",
      agentId,
      dialeto: "mssql",
      clientToken: "tok-sql-123456",
    });
    const sessions = {
      getAccessToken: async () => "access-test",
      invalidate: () => undefined,
      remember: () => undefined,
    };
    const sqlModelo = "SELECT p.DataPagamento, p.ValorPago FROM ContaPagar p WHERE p.ValorPago > 0";
    const skill = await skills.create({
      acessoId: created.acessoId,
      slug: "titulos-a-pagar-recorte",
      nome: "Títulos a pagar",
      descricao: "pagar",
      sqlModelo,
      escopo: escopoFromSqlModelo(parseSqlModelo(sqlModelo)),
      autorUsuarioId: created.usuarioId,
    });
    await skills.setStatus(skill.id, "publicada");
    const pagar = await grafo.mergeTabela({
      acessoId: created.acessoId,
      nome: "ContaPagar",
      origem: "validado_execucao",
      autorUsuarioId: created.usuarioId,
    });
    const filial = await grafo.mergeTabela({
      acessoId: created.acessoId,
      nome: "Filial",
      origem: "inferido",
      autorUsuarioId: created.usuarioId,
    });
    await grafo.mergeColuna({
      acessoId: created.acessoId,
      tabelaId: pagar.tabela.id,
      nome: "DataPagamento",
      tipo: "datetime",
      origem: "validado_execucao",
      autorUsuarioId: created.usuarioId,
    });
    await grafo.mergeColuna({
      acessoId: created.acessoId,
      tabelaId: pagar.tabela.id,
      nome: "ValorPago",
      tipo: "numeric",
      origem: "validado_execucao",
      autorUsuarioId: created.usuarioId,
    });
    await grafo.mergeColuna({
      acessoId: created.acessoId,
      tabelaId: pagar.tabela.id,
      nome: "CodEmpresa",
      tipo: "int",
      origem: "inferido",
      autorUsuarioId: created.usuarioId,
    });
    await grafo.mergeColuna({
      acessoId: created.acessoId,
      tabelaId: filial.tabela.id,
      nome: "CodEmpresa",
      tipo: "int",
      origem: "inferido",
      autorUsuarioId: created.usuarioId,
    });
    await grafo.mergeRelacionamento({
      acessoId: created.acessoId,
      tabelaOrigemId: pagar.tabela.id,
      tabelaDestinoId: filial.tabela.id,
      pares: [{ colunaOrigem: "CodEmpresa", colunaDestino: "CodEmpresa" }],
      tipoJoin: "inner",
      origem: "inferido",
      autorUsuarioId: created.usuarioId,
    });
    const descobrir = new DescobrirTabela(acessos, skills, grafo, plug, sessions, crypto);
    const result = await descobrir.execute(created.usuarioId, {
      acessoId: created.acessoId,
      tabela: "ContaPagar",
    });
    expect(result.colunas.map((coluna) => coluna.nome)).toEqual(["DataPagamento", "ValorPago"]);
    expect(result.colunas.map((coluna) => coluna.nome)).not.toContain("CodEmpresa");
    expect(result.relacionamentos).toEqual([]);
  });
});
