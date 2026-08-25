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
import { mapPlugServerFailure } from "../../src/infrastructure/plug-server/map-plug-error.js";
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
    remember: () => undefined,
  };
  const consultar = new ConsultarDados(acessos, skills, plug, sessions, crypto, audit, 500, 5000);
  return { plug, skills, consultar, created, acessos };
};

describe("ConsultarDados", () => {
  it("recusa SQL com tabela fora do escopo", async () => {
    const { consultar, created, skills } = await setupAcesso();
    const skill = await skills.create({
      agentId,
      slug: "produtos",
      nome: "Produtos",
      descricao: "Lista produtos",
      sqlModelo: "SELECT p.codprod AS codigo FROM produto p",
      autorUsuarioId: created.usuarioId,
    });
    await skills.setStatus(skill.id, "publicada");
    await expect(
      consultar.execute(created.usuarioId, {
        acessoId: created.acessoId,
        skillId: skill.id,
        sql: "SELECT f.valor FROM faturamento f WHERE f.ano = 2026",
      }),
    ).rejects.toMatchObject({ code: ERROR_CODES.TABELA_FORA_DO_ESCOPO });
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
    expect(result.sqlExecutado).toContain("produto");
    expect(result.paramsUsados).toEqual({ codigo: 99 });
    expect(result.asOf).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.truncated).toBe(false);
    expect(plug.lastSql).toContain("produto");
    expect(plug.lastSql).not.toMatch(/select \*/i);
    expect(plug.lastParams).toEqual({ codigo: 99 });
  });

  it("asOf usa o timezone do acesso", async () => {
    const { consultar, created, skills, acessos } = await setupAcesso();
    await acessos.updateEscopoPadrao(created.acessoId, null, "America/Cuiaba");
    const skill = await skills.create({
      agentId,
      slug: "tz",
      nome: "Tz",
      descricao: "Tz",
      sqlModelo: "SELECT p.codprod AS codigo FROM produto p",
      autorUsuarioId: created.usuarioId,
    });
    await skills.setStatus(skill.id, "publicada");
    const result = await consultar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      skillId: skill.id,
    });
    expect(result.asOf).toMatch(/\[America\/Cuiaba\]$/);
  });

  it("marca truncated só quando veio linha além do teto", async () => {
    const { consultar, created, skills, plug } = await setupAcesso();
    plug.sqlImpl = async () => ({
      columns: ["codigo"],
      rows: [{ codigo: 1 }, { codigo: 2 }],
    });
    const skill = await skills.create({
      agentId,
      slug: "lista",
      nome: "Lista",
      descricao: "Lista",
      sqlModelo: "SELECT p.codprod AS codigo FROM produto p",
      autorUsuarioId: created.usuarioId,
    });
    await skills.setStatus(skill.id, "publicada");
    const exato = await consultar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      skillId: skill.id,
      options: { max_rows: 2 },
    });
    expect(exato.truncated).toBe(false);
    expect(exato.rowCount).toBe(2);
    plug.sqlImpl = async () => ({
      columns: ["codigo"],
      rows: [{ codigo: 1 }, { codigo: 2 }, { codigo: 3 }],
    });
    const cortado = await consultar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      skillId: skill.id,
      options: { max_rows: 2 },
    });
    expect(cortado.truncated).toBe(true);
    expect(cortado.rowCount).toBe(2);
  });

  it("sugere slug próximo quando skillId não existe", async () => {
    const { consultar, created, skills } = await setupAcesso();
    await skills.create({
      agentId,
      slug: "titulos-a-receber",
      nome: "Títulos",
      descricao: "Lista",
      sqlModelo: "SELECT t.cod AS codigo FROM titulo t",
      autorUsuarioId: created.usuarioId,
    });
    await expect(
      consultar.execute(created.usuarioId, {
        acessoId: created.acessoId,
        skillId: "titulos-a-recebr",
      }),
    ).rejects.toMatchObject({
      code: ERROR_CODES.SKILL_NOT_FOUND,
      hint: expect.stringContaining("titulos-a-receber"),
    });
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

  it("mapeia classificação do plug para INVALID_SQL e cita as tabelas", async () => {
    const { consultar, created, skills, plug } = await setupAcesso();
    plug.sqlImpl = async () => {
      throw mapPlugServerFailure({
        status: 200,
        body: {
          response: {
            item: {
              error: {
                code: -32002,
                message: "Not authorized",
                data: {
                  technical_message: "Authorization denied: unsupported SQL classification",
                },
              },
            },
          },
        },
      });
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
    await expect(
      consultar.execute(created.usuarioId, {
        acessoId: created.acessoId,
        skillId: skill.id,
      }),
    ).rejects.toMatchObject({
      code: ERROR_CODES.INVALID_SQL,
      hint: expect.stringMatching(/produto/i),
    });
  });

  it("recusa paginação do sqlModelo sem ORDER BY antes do plug", async () => {
    const { consultar, created, skills, plug } = await setupAcesso();
    plug.sqlImpl = async () => {
      throw new Error("não deve chamar o plug");
    };
    const skill = await skills.create({
      agentId,
      slug: "lista",
      nome: "Lista",
      descricao: "Lista",
      sqlModelo: "SELECT p.codprod AS codigo FROM produto p",
      autorUsuarioId: created.usuarioId,
    });
    await skills.setStatus(skill.id, "publicada");
    await expect(
      consultar.execute(created.usuarioId, {
        acessoId: created.acessoId,
        skillId: skill.id,
        options: { page: 1, page_size: 20 },
      }),
    ).rejects.toMatchObject({
      code: ERROR_CODES.VALIDATION_ERROR,
      message: "Paginação exige ORDER BY.",
    });
    expect(plug.lastSql).toBeNull();
  });

  it("só encaminha page ao plug quando page_size vem junto", async () => {
    const { consultar, created, skills, plug } = await setupAcesso();
    const skill = await skills.create({
      agentId,
      slug: "lista-ordenada",
      nome: "Lista",
      descricao: "Lista",
      sqlModelo: "SELECT p.codprod AS codigo FROM produto p ORDER BY p.codprod",
      autorUsuarioId: created.usuarioId,
    });
    await skills.setStatus(skill.id, "publicada");
    await consultar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      skillId: skill.id,
      options: { page: 2 },
    });
    expect(plug.lastOptions?.page).toBeUndefined();
    expect(plug.lastOptions?.pageSize).toBeUndefined();
    await consultar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      skillId: skill.id,
      options: { page: 2, page_size: 10 },
    });
    expect(plug.lastOptions?.page).toBe(2);
    expect(plug.lastOptions?.pageSize).toBe(10);
  });
});
