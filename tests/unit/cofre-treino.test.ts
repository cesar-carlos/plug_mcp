import { describe, expect, it } from "vitest";
import {
  AdicionarAcesso,
  RegistrarAcesso,
  VerificarAcesso,
} from "../../src/application/use-cases/cofre.js";
import { TreinarComSql } from "../../src/application/use-cases/treinar-com-sql.js";
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
import { stubSessions } from "../helpers/stub-sessions.js";
import { DomainError } from "../../src/domain/errors/domain-error.js";
import { ERROR_CODES } from "../../src/domain/errors/error-codes.js";

const crypto = new NodeCryptoAdapter(
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
);
const agentId = "11111111-1111-4111-8111-111111111111";

describe("cofre e treino", () => {
  it("registrar_acesso emite setupCode e não devolve o token MCP", async () => {
    const plug = new FakePlugServer();
    plug.approve(agentId);
    const usuarios = new InMemoryUsuarioRepository();
    const acessos = new InMemoryAcessoRepository();
    const setup = new SetupCodeStore();
    const uc = new RegistrarAcesso(
      usuarios,
      acessos,
      plug,
      crypto,
      setup,
      "http://127.0.0.1:3333",
      0,
    );
    const result = await uc.execute({
      email: "client@example.com",
      senha: "secret-pass",
      agentId,
      dialeto: "sybase",
      clientToken: "tok-sql-123456",
      nomeAmigavel: "ERP",
    });
    expect(result.setupCode).toBeTruthy();
    expect(JSON.stringify(result)).not.toMatch(/secret-pass/);
    expect(result).not.toHaveProperty("token");
    const token = setup.consume(result.setupCode!);
    expect(token).toBeTruthy();
    expect(setup.consume(result.setupCode!)).toBeNull();
  });

  it("treinar_com_sql rejeita SELECT * e funde grafo após executeSql", async () => {
    const plug = new FakePlugServer();
    plug.approve(agentId);
    const usuarios = new InMemoryUsuarioRepository();
    const acessos = new InMemoryAcessoRepository();
    const grafo = new InMemoryGrafoRepository();
    const audit = new InMemoryAuditLog();
    const setup = new SetupCodeStore();
    const registrar = new RegistrarAcesso(
      usuarios,
      acessos,
      plug,
      crypto,
      setup,
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
    const treinar = new TreinarComSql(
      acessos,
      grafo,
      plug,
      sessions,
      crypto,
      audit,
      new InMemorySkillRepository(),
    );
    await expect(
      treinar.execute(created.usuarioId, {
        acessoId: created.acessoId,
        sql: "SELECT * FROM produto",
      }),
    ).rejects.toBeInstanceOf(DomainError);

    const trained = await treinar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      sql: "SELECT p.codprod AS codigo, p.descricao FROM produto p",
    });
    expect(trained.tabelas.map((t) => t.toLowerCase())).toContain("produto");
    const tabelas = await grafo.listTabelas(agentId);
    expect(tabelas.some((t) => t.nome.toLowerCase() === "produto")).toBe(true);
  });

  it("policy recusa tabela fora do client_token", async () => {
    const plug = new FakePlugServer();
    plug.approve(agentId);
    plug.policy = { allTables: false, tables: ["outra"] };
    const usuarios = new InMemoryUsuarioRepository();
    const acessos = new InMemoryAcessoRepository();
    const grafo = new InMemoryGrafoRepository();
    const audit = new InMemoryAuditLog();
    const setup = new SetupCodeStore();
    const registrar = new RegistrarAcesso(
      usuarios,
      acessos,
      plug,
      crypto,
      setup,
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
    const treinar = new TreinarComSql(
      acessos,
      grafo,
      plug,
      {
        getAccessToken: async () => "access-test",
        invalidate: () => undefined,
        remember: () => undefined,
      },
      crypto,
      audit,
      new InMemorySkillRepository(),
    );
    await expect(
      treinar.execute(created.usuarioId, {
        acessoId: created.acessoId,
        sql: "SELECT p.codprod FROM produto p",
      }),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED", source: "client_token_rpc" });
  });

  it("dois usuarios no mesmo agentId acumulam o grafo", async () => {
    const plug = new FakePlugServer();
    plug.approve(agentId);
    const acessos = new InMemoryAcessoRepository();
    const grafo = new InMemoryGrafoRepository();
    const audit = new InMemoryAuditLog();
    const setup = new SetupCodeStore();
    const registrar = new RegistrarAcesso(
      new InMemoryUsuarioRepository(),
      acessos,
      plug,
      crypto,
      setup,
      "http://localhost",
      0,
    );
    const a = await registrar.execute({
      email: "a@b.com",
      senha: "secret-pass",
      agentId,
      dialeto: "sybase",
      clientToken: "tok-a-12345678",
    });
    const b = await registrar.execute({
      email: "c@d.com",
      senha: "secret-pass",
      agentId,
      dialeto: "sybase",
      clientToken: "tok-b-12345678",
    });
    const sessions = {
      getAccessToken: async () => "access-test",
      invalidate: () => undefined,
      remember: () => undefined,
    };
    await new TreinarComSql(
      acessos,
      grafo,
      plug,
      sessions,
      crypto,
      audit,
      new InMemorySkillRepository(),
    ).execute(a.usuarioId, {
      acessoId: a.acessoId,
      sql: "SELECT p.codprod FROM produto p",
    });
    await new TreinarComSql(
      acessos,
      grafo,
      plug,
      sessions,
      crypto,
      audit,
      new InMemorySkillRepository(),
    ).execute(b.usuarioId, {
      acessoId: b.acessoId,
      sql: "SELECT c.codcli FROM cliente c",
    });
    const tabelas = await grafo.listTabelas(agentId);
    expect(tabelas.map((t) => t.nome.toLowerCase()).sort()).toEqual(["cliente", "produto"]);
  });

  it("dialeto divergente no mesmo agentId gera DIALECT_CONFLICT", async () => {
    const plug = new FakePlugServer();
    plug.approve(agentId);
    const acessos = new InMemoryAcessoRepository();
    const grafo = new InMemoryGrafoRepository();
    const audit = new InMemoryAuditLog();
    const setup = new SetupCodeStore();
    const registrar = new RegistrarAcesso(
      new InMemoryUsuarioRepository(),
      acessos,
      plug,
      crypto,
      setup,
      "http://localhost",
      0,
    );
    const a = await registrar.execute({
      email: "a@b.com",
      senha: "secret-pass",
      agentId,
      dialeto: "sybase",
      clientToken: "tok-a-12345678",
    });
    const b = await registrar.execute({
      email: "c@d.com",
      senha: "secret-pass",
      agentId,
      dialeto: "postgres",
      clientToken: "tok-b-12345678",
    });
    const sessions = {
      getAccessToken: async () => "access-test",
      invalidate: () => undefined,
      remember: () => undefined,
    };
    await new TreinarComSql(
      acessos,
      grafo,
      plug,
      sessions,
      crypto,
      audit,
      new InMemorySkillRepository(),
    ).execute(a.usuarioId, {
      acessoId: a.acessoId,
      sql: "SELECT p.codprod FROM produto p",
    });
    await expect(
      new TreinarComSql(
        acessos,
        grafo,
        plug,
        sessions,
        crypto,
        audit,
        new InMemorySkillRepository(),
      ).execute(b.usuarioId, {
        acessoId: b.acessoId,
        sql: "SELECT p.codprod FROM produto p",
      }),
    ).rejects.toMatchObject({ code: "DIALECT_CONFLICT" });
  });

  it("liga coluna ao alias dono e grava chaves reais do JOIN", async () => {
    const plug = new FakePlugServer();
    plug.approve(agentId);
    const usuarios = new InMemoryUsuarioRepository();
    const acessos = new InMemoryAcessoRepository();
    const grafo = new InMemoryGrafoRepository();
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
      dialeto: "sybase",
      clientToken: "tok-sql-123456",
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
      audit,
      new InMemorySkillRepository(),
    );
    await treinar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      sql: "SELECT p.codprod, c.nome FROM produto p INNER JOIN cliente c ON c.codcli = p.codcli",
    });
    const tabelas = await grafo.listTabelas(agentId);
    const produto = tabelas.find((t) => t.nome.toLowerCase() === "produto");
    const cliente = tabelas.find((t) => t.nome.toLowerCase() === "cliente");
    expect(produto).toBeDefined();
    expect(cliente).toBeDefined();
    const colsProduto = await grafo.listColunas(produto!.id);
    const colsCliente = await grafo.listColunas(cliente!.id);
    expect(colsProduto.some((c) => c.nome.toLowerCase() === "codprod")).toBe(true);
    expect(colsProduto.some((c) => c.nome.toLowerCase() === "codcli")).toBe(true);
    expect(colsProduto.some((c) => c.nome.toLowerCase() === "nome")).toBe(false);
    expect(colsCliente.some((c) => c.nome.toLowerCase() === "nome")).toBe(true);
    expect(colsCliente.some((c) => c.nome.toLowerCase() === "codcli")).toBe(true);
    const rels = await grafo.listRelacionamentos(agentId);
    expect(rels).toHaveLength(1);
    expect(rels[0]?.colunaOrigem.toLowerCase()).toBe("codcli");
    expect(rels[0]?.colunaDestino.toLowerCase()).toBe("codcli");
    expect(rels[0]?.tabelaOrigemId).toBe(cliente!.id);
    expect(rels[0]?.tabelaDestinoId).toBe(produto!.id);
  });

  it("treinar_com_sql poda JOIN isolado coberto por composto", async () => {
    const plug = new FakePlugServer();
    plug.approve(agentId);
    const acessos = new InMemoryAcessoRepository();
    const grafo = new InMemoryGrafoRepository();
    const audit = new InMemoryAuditLog();
    const created = await new RegistrarAcesso(
      new InMemoryUsuarioRepository(),
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
    const treinar = new TreinarComSql(
      acessos,
      grafo,
      plug,
      sessions,
      crypto,
      audit,
      new InMemorySkillRepository(),
    );
    await treinar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      sql: "SELECT f.empresa FROM filial f INNER JOIN receber r ON f.empresa = r.empresa WHERE r.valor > 0",
    });
    await treinar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      sql: "SELECT f.empresa FROM filial f INNER JOIN receber r ON f.empresa = r.empresa AND f.filial = r.filial WHERE r.valor > 0",
    });
    const rels = await grafo.listRelacionamentos(agentId);
    expect(rels).toHaveLength(1);
    expect(rels[0]?.pares).toHaveLength(2);
  });

  it("recusa SELECT sem qualificador quando há JOIN", async () => {
    const plug = new FakePlugServer();
    plug.approve(agentId);
    const usuarios = new InMemoryUsuarioRepository();
    const acessos = new InMemoryAcessoRepository();
    const grafo = new InMemoryGrafoRepository();
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
      dialeto: "sybase",
      clientToken: "tok-sql-123456",
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
      audit,
      new InMemorySkillRepository(),
    );
    await expect(
      treinar.execute(created.usuarioId, {
        acessoId: created.acessoId,
        sql: "SELECT codprod, nome FROM produto p INNER JOIN cliente c ON c.codcli = p.codcli",
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.INVALID_SQL });
  });

  it("CROSS JOIN não grava relacionamento *", async () => {
    const plug = new FakePlugServer();
    plug.approve(agentId);
    const usuarios = new InMemoryUsuarioRepository();
    const acessos = new InMemoryAcessoRepository();
    const grafo = new InMemoryGrafoRepository();
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
      dialeto: "sybase",
      clientToken: "tok-sql-123456",
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
      audit,
      new InMemorySkillRepository(),
    );
    await treinar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      sql: "SELECT p.codprod, c.nome FROM produto p CROSS JOIN cliente c",
    });
    const rels = await grafo.listRelacionamentos(agentId);
    expect(rels).toHaveLength(0);
  });

  it("registrar_acesso chama putClientToken quando o hub já aprovou", async () => {
    const plug = new FakePlugServer();
    plug.approve(agentId);
    const registrar = new RegistrarAcesso(
      new InMemoryUsuarioRepository(),
      new InMemoryAcessoRepository(),
      plug,
      crypto,
      new SetupCodeStore(),
      "http://localhost",
      0,
    );
    await registrar.execute({
      email: "a@b.com",
      senha: "secret-pass",
      agentId,
      dialeto: "sybase",
      clientToken: "tok-sql-123456",
    });
    expect(plug.lastPut).toEqual({ agentId, clientToken: "tok-sql-123456" });
  });

  it("adicionar_acesso chama putClientToken quando o hub já aprovou", async () => {
    const plug = new FakePlugServer();
    const agent2 = "22222222-2222-4222-8222-222222222222";
    plug.approve(agentId);
    plug.approve(agent2);
    const acessos = new InMemoryAcessoRepository();
    const created = await new RegistrarAcesso(
      new InMemoryUsuarioRepository(),
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
    plug.lastPut = null;
    await new AdicionarAcesso(acessos, plug, stubSessions(), crypto).execute(created.usuarioId, {
      agentId: agent2,
      dialeto: "sybase",
      clientToken: "tok-other-999",
    });
    expect(plug.lastPut).toEqual({ agentId: agent2, clientToken: "tok-other-999" });
  });

  it("PUT 403 com acesso pending não falha o caso de uso", async () => {
    const plug = new FakePlugServer();
    plug.putImpl = async () => {
      throw new DomainError({
        code: ERROR_CODES.AGENT_ACCESS_DENIED,
        message: "sem acesso ao agente",
        hint: "pending",
      });
    };
    const result = await new RegistrarAcesso(
      new InMemoryUsuarioRepository(),
      new InMemoryAcessoRepository(),
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
    expect(result.statusAcesso).toBe("pending");
    expect(result.acessoId).toBeTruthy();
  });

  it("verificar_acesso tenta PUT ao virar approved", async () => {
    const plug = new FakePlugServer();
    const acessos = new InMemoryAcessoRepository();
    const created = await new RegistrarAcesso(
      new InMemoryUsuarioRepository(),
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
    expect(created.statusAcesso).toBe("pending");
    plug.approve(agentId);
    plug.lastPut = null;
    await new VerificarAcesso(acessos, plug, stubSessions(), crypto).execute(created.usuarioId, {
      acessoId: created.acessoId,
    });
    expect(plug.lastPut).toEqual({ agentId, clientToken: "tok-sql-123456" });
  });

  it("SQL com cofre pending e hub approved passa após o refresh único", async () => {
    const plug = new FakePlugServer();
    const acessos = new InMemoryAcessoRepository();
    const grafo = new InMemoryGrafoRepository();
    const created = await new RegistrarAcesso(
      new InMemoryUsuarioRepository(),
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
    expect(created.statusAcesso).toBe("pending");
    plug.approve(agentId);
    const trained = await new TreinarComSql(
      acessos,
      grafo,
      plug,
      stubSessions(),
      crypto,
      new InMemoryAuditLog(),
      new InMemorySkillRepository(),
    ).execute(created.usuarioId, {
      acessoId: created.acessoId,
      sql: "SELECT p.codprod FROM produto p",
    });
    expect(trained.tabelas.map((t) => t.toLowerCase())).toContain("produto");
    const acesso = await acessos.findById(created.acessoId);
    expect(acesso?.statusAcesso).toBe("approved");
  });
});
