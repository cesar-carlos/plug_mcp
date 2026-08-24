import { describe, expect, it } from "vitest";
import { ConsultarDados } from "../../src/application/use-cases/consultar.js";
import { RegistrarAcesso } from "../../src/application/use-cases/cofre.js";
import { DomainError } from "../../src/domain/errors/domain-error.js";
import { ERROR_CODES } from "../../src/domain/errors/error-codes.js";
import { NodeCryptoAdapter } from "../../src/infrastructure/crypto/node-crypto.adapter.js";
import { SetupCodeStore } from "../../src/infrastructure/http/setup-code-store.js";
import {
  InMemoryAcessoRepository,
  InMemoryAuditLog,
  InMemorySkillRepository,
  InMemoryUsuarioRepository,
} from "../../src/infrastructure/persistence/memory/memory-cofre.js";
import { FakePlugServer } from "../helpers/fake-plug-server.js";

const crypto = new NodeCryptoAdapter(
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
);
const agentId = "11111111-1111-4111-8111-111111111111";

const setupAcesso = async () => {
  const plug = new FakePlugServer();
  plug.approve(agentId);
  const usuarios = new InMemoryUsuarioRepository();
  const acessos = new InMemoryAcessoRepository();
  const skills = new InMemorySkillRepository();
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
  };
  const consultar = new ConsultarDados(acessos, skills, plug, sessions, crypto, audit, 500, 5000);
  return { plug, skills, consultar, created };
};

describe("ConsultarDados", () => {
  it("recusa SQL solto", async () => {
    const { consultar, created } = await setupAcesso();
    await expect(
      consultar.execute(created.usuarioId, {
        acessoId: created.acessoId,
        sql: "SELECT p.codprod FROM produto p",
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_ERROR });
  });

  it("exige skillId", async () => {
    const { consultar, created } = await setupAcesso();
    await expect(
      consultar.execute(created.usuarioId, { acessoId: created.acessoId }),
    ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_ERROR });
  });

  it("recusa skill não publicada", async () => {
    const { consultar, created, skills } = await setupAcesso();
    const skill = await skills.create({
      agentId,
      slug: "produtos",
      nome: "Produtos",
      descricao: "Lista produtos",
      sqlModelo: "SELECT p.codprod AS codigo FROM produto p",
      autorUsuarioId: created.usuarioId,
    });
    await expect(
      consultar.execute(created.usuarioId, {
        acessoId: created.acessoId,
        skillId: skill.id,
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.SKILL_NOT_PUBLISHED });
  });

  it("reaplica parse e bind no sqlModelo persistido", async () => {
    const { consultar, created, skills, plug } = await setupAcesso();
    plug.sqlImpl = async () => ({
      columns: ["codigo"],
      rows: [{ codigo: 1 }],
    });
    const skill = await skills.create({
      agentId,
      slug: "produto-por-codigo",
      nome: "Produto",
      descricao: "Busca produto",
      sqlModelo: "SELECT p.codprod AS codigo FROM produto p WHERE p.codprod = :codigo",
      autorUsuarioId: created.usuarioId,
    });
    await skills.setStatus(skill.id, "publicada");
    const result = await consultar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      skillId: skill.id,
      params: { codigo: 99 },
    });
    expect(result.success).toBe(true);
    expect(result.skillId).toBe(skill.id);
    expect(plug.lastSql).toContain("produto");
    expect(plug.lastSql).not.toMatch(/select \*/i);
    expect(plug.lastParams).toEqual({ codigo: 99 });
    expect(JSON.stringify(result)).not.toContain("SELECT p.codprod");
  });

  it("recusa segundo comando no modelo persistido", async () => {
    const { consultar, created, skills } = await setupAcesso();
    const skill = await skills.create({
      agentId,
      slug: "injecao",
      nome: "Ruim",
      descricao: "SQL inválido",
      sqlModelo: "SELECT p.codprod AS codigo FROM produto p; DELETE FROM produto",
      autorUsuarioId: created.usuarioId,
    });
    await skills.setStatus(skill.id, "publicada");
    await expect(
      consultar.execute(created.usuarioId, {
        acessoId: created.acessoId,
        skillId: skill.id,
      }),
    ).rejects.toBeInstanceOf(DomainError);
  });
});
