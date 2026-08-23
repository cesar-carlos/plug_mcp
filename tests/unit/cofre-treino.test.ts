import { describe, expect, it } from "vitest";
import { RegistrarAcesso } from "../../src/application/use-cases/cofre.js";
import { TreinarComSql } from "../../src/application/use-cases/treinar-com-sql.js";
import { NodeCryptoAdapter } from "../../src/infrastructure/crypto/node-crypto.adapter.js";
import { SetupCodeStore } from "../../src/infrastructure/http/setup-code-store.js";
import {
  InMemoryAcessoRepository,
  InMemoryAuditLog,
  InMemoryGrafoRepository,
  InMemoryUsuarioRepository,
} from "../../src/infrastructure/persistence/memory/memory-cofre.js";
import { FakePlugServer } from "../helpers/fake-plug-server.js";
import { DomainError } from "../../src/domain/errors/domain-error.js";

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
    const uc = new RegistrarAcesso(usuarios, acessos, plug, crypto, setup, "http://127.0.0.1:3333");
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
    };
    const treinar = new TreinarComSql(acessos, grafo, plug, sessions, crypto, audit);
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
      { getAccessToken: async () => "access-test", invalidate: () => undefined },
      crypto,
      audit,
    );
    await expect(
      treinar.execute(created.usuarioId, {
        acessoId: created.acessoId,
        sql: "SELECT p.codprod FROM produto p",
      }),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
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
    const sessions = { getAccessToken: async () => "access-test", invalidate: () => undefined };
    await new TreinarComSql(acessos, grafo, plug, sessions, crypto, audit).execute(a.usuarioId, {
      acessoId: a.acessoId,
      sql: "SELECT p.codprod FROM produto p",
    });
    await new TreinarComSql(acessos, grafo, plug, sessions, crypto, audit).execute(b.usuarioId, {
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
    const sessions = { getAccessToken: async () => "access-test", invalidate: () => undefined };
    await new TreinarComSql(acessos, grafo, plug, sessions, crypto, audit).execute(a.usuarioId, {
      acessoId: a.acessoId,
      sql: "SELECT p.codprod FROM produto p",
    });
    await expect(
      new TreinarComSql(acessos, grafo, plug, sessions, crypto, audit).execute(b.usuarioId, {
        acessoId: b.acessoId,
        sql: "SELECT p.codprod FROM produto p",
      }),
    ).rejects.toMatchObject({ code: "DIALECT_CONFLICT" });
  });
});
