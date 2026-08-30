import { describe, expect, it } from "vitest";
import {
  InspecionarConsulta,
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
  it("teto 100, mascara PII e recusa sem finalidade", async () => {
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
      agentId,
      slug: "clientes",
      nome: "Clientes",
      descricao: "cadastro",
      sqlModelo,
      escopo: escopoFromSqlModelo(parseSqlModelo(sqlModelo)),
      autorUsuarioId: created.usuarioId,
    });
    await skills.setStatus(skill.id, "publicada");
    plug.sqlImpl = async () => ({
      columns: ["codcli", "nome"],
      rows: Array.from({ length: 120 }, (_, i) => ({
        codcli: i + 1,
        nome: "Pessoa",
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

    await expect(
      inspecionar.execute(created.usuarioId, {
        acessoId: created.acessoId,
        skillId: skill.id,
        sql: "SELECT c.codcli, c.senha FROM cliente c WHERE c.codcli > 0",
        finalidade: "amostra_estrutura",
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.PRIVACIDADE_NEGADA });

    const result = await inspecionar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      skillId: skill.id,
      sql: "SELECT c.codcli, c.nome FROM cliente c WHERE c.codcli > 0",
      finalidade: "amostra_estrutura",
    });
    expect(result.maxRowsApplied).toBe(INSPECAO_MAX_ROWS);
    expect(result.rowCount).toBeLessThanOrEqual(INSPECAO_MAX_ROWS);
    expect(String(result.rows[0]?.nome)).toMatch(/^p_/);
    expect(result.rows.some((row) => Object.values(row).includes("Pessoa"))).toBe(false);
    expect(audit.entries.every((entry) => !String(entry.sqlEnviado).includes("Pessoa"))).toBe(true);
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
      agentId: fbAgent,
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
    ).rejects.toMatchObject({ code: ERROR_CODES.DIALECT_UNSUPPORTED });

    const result = await inspecionar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      skillId: skill.id,
      finalidade: "amostra_estrutura",
    });
    expect(result.maxRowsApplied).toBe(INSPECAO_MAX_ROWS);
    expect(result.rowCount).toBe(1);
    expect(String(result.rows[0]?.nome)).toMatch(/^p_/);
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
      agentId,
      slug: "clientes-rascunho",
      nome: "Clientes rascunho",
      descricao: "cadastro",
      sqlModelo,
      escopo: escopoFromSqlModelo(parseSqlModelo(sqlModelo)),
      autorUsuarioId: created.usuarioId,
    });
    const validada = await skills.create({
      agentId,
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
});
