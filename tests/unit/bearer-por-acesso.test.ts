import { describe, expect, it } from "vitest";
import {
  AdicionarAcesso,
  ListarAcessos,
  RegistrarAcesso,
  RemoverAcesso,
  RotacionarTokenMcp,
} from "../../src/application/use-cases/cofre.js";
import { ListarAuditoria } from "../../src/application/use-cases/aprendizado.js";
import { AtualizarPersona } from "../../src/application/use-cases/cofre.js";
import { ListarSkills } from "../../src/application/use-cases/skills.js";
import { TreinarComSql } from "../../src/application/use-cases/treinar-com-sql.js";
import { CriarSkill } from "../../src/application/use-cases/skills.js";
import { sessionContext } from "../../src/application/session-context.js";
import { DomainError } from "../../src/domain/errors/domain-error.js";
import { ERROR_CODES } from "../../src/domain/errors/error-codes.js";
import { NodeCryptoAdapter } from "../../src/infrastructure/crypto/node-crypto.adapter.js";
import { SetupCodeStore } from "../../src/infrastructure/http/setup-code-store.js";
import {
  InMemoryAcessoRepository,
  InMemoryAnotacaoGrafoRepository,
  InMemoryAprendizadoRepository,
  InMemoryAuditLog,
  InMemoryGrafoRepository,
  InMemoryMcpSetupRepository,
  InMemorySkillRepository,
  InMemoryUsuarioRepository,
} from "../../src/infrastructure/persistence/memory/memory-cofre.js";
import { FakePlugServer } from "../helpers/fake-plug-server.js";
import { seedTabelaComColunas } from "../helpers/seed-grafo.js";
import { stubSessions } from "../helpers/stub-sessions.js";

const crypto = new NodeCryptoAdapter(
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
);
const agentId = "11111111-1111-4111-8111-111111111111";

const withBound = <T>(usuarioId: string, acessoId: string, fn: () => Promise<T>): Promise<T> =>
  sessionContext.run({ usuarioId, acessoId }, fn);

describe("Bearer 1:1 com acesso", () => {
  const repos = () => {
    const plug = new FakePlugServer();
    plug.approve(agentId);
    return {
      plug,
      usuarios: new InMemoryUsuarioRepository(),
      acessos: new InMemoryAcessoRepository(),
      skills: new InMemorySkillRepository(),
      grafo: new InMemoryGrafoRepository(),
      anotacoes: new InMemoryAnotacaoGrafoRepository(),
      aprendizado: new InMemoryAprendizadoRepository(),
      audit: new InMemoryAuditLog(),
      setup: new SetupCodeStore(),
      setupPersistent: new InMemoryMcpSetupRepository(),
    };
  };

  const registrar = (
    ctx: ReturnType<typeof repos>,
    email: string,
    clientToken: string,
  ): Promise<{
    usuarioId: string;
    acessoId: string;
    setupCode?: string;
    setupUrl?: string;
  }> =>
    new RegistrarAcesso(
      ctx.usuarios,
      ctx.acessos,
      ctx.plug,
      crypto,
      ctx.setup,
      "http://localhost",
      0,
      undefined,
      undefined,
      ctx.setupPersistent,
    ).execute({
      email,
      senha: "secret-pass",
      agentId,
      dialeto: "mssql",
      clientToken,
    });

  it("dois CLIENT_TOKEN no mesmo e-mail geram Bearers e catálogos distintos", async () => {
    const ctx = repos();
    const primeiro = await registrar(ctx, "mesmo@b.com", "tok-persona-a-111");
    expect(primeiro.setupCode).toBeTruthy();
    const tokenA = ctx.setup.consume(primeiro.setupCode!);
    expect(tokenA).toBeTruthy();
    const segundo = await registrar(ctx, "mesmo@b.com", "tok-persona-b-222");
    expect(segundo.setupCode).toBeTruthy();
    expect(segundo.acessoId).not.toBe(primeiro.acessoId);
    const tokenB = ctx.setup.consume(segundo.setupCode!);
    expect(tokenB).toBeTruthy();
    expect(tokenB).not.toBe(tokenA);
    const hashA = (await ctx.acessos.findById(primeiro.acessoId))!.tokenHash;
    const hashB = (await ctx.acessos.findById(segundo.acessoId))!.tokenHash;
    expect(hashA).not.toBe(hashB);
    expect((await ctx.acessos.findByTokenHash(crypto.sha256Hex(tokenA!)))?.id).toBe(
      primeiro.acessoId,
    );
    expect((await ctx.acessos.findByTokenHash(crypto.sha256Hex(tokenB!)))?.id).toBe(
      segundo.acessoId,
    );
  });

  it("Bearer A não lê o catálogo do Bearer B", async () => {
    const ctx = repos();
    const a = await registrar(ctx, "iso@b.com", "tok-iso-a-1111");
    const b = await registrar(ctx, "iso@b.com", "tok-iso-b-2222");
    await seedTabelaComColunas(ctx.grafo, {
      acessoId: a.acessoId,
      usuarioId: a.usuarioId,
      nome: "produto",
      colunas: ["codprod"],
    });
    await new TreinarComSql(
      ctx.acessos,
      ctx.grafo,
      ctx.plug,
      stubSessions(),
      crypto,
      ctx.audit,
      ctx.skills,
    ).execute(a.usuarioId, {
      acessoId: a.acessoId,
      sql: "SELECT p.codprod AS codigo FROM produto p WHERE p.codprod > 0",
    });
    const created = await new CriarSkill(ctx.acessos, ctx.skills, ctx.grafo).execute(a.usuarioId, {
      acessoId: a.acessoId,
      nome: "Produtos A",
      descricao: "Produtos do catalogo",
      sqlModelo: "SELECT p.codprod AS codigo FROM produto p WHERE p.codprod > 0",
    });
    const listar = new ListarSkills(ctx.acessos, ctx.skills, ctx.grafo);
    const listedA = await withBound(a.usuarioId, a.acessoId, () => listar.execute(a.usuarioId, {}));
    expect(listedA.skills).toHaveLength(1);
    const listedB = await withBound(b.usuarioId, b.acessoId, () => listar.execute(b.usuarioId, {}));
    expect(listedB.skills).toHaveLength(0);
    await withBound(b.usuarioId, b.acessoId, async () => {
      await expect(listar.execute(b.usuarioId, { acessoId: a.acessoId })).rejects.toMatchObject({
        code: ERROR_CODES.VALIDATION_ERROR,
      });
    });
    await ctx.audit.append({
      usuarioId: a.usuarioId,
      acessoId: a.acessoId,
      tool: "consultar_dados",
      sqlEnviado: "SELECT a",
      sucesso: true,
      codigoErro: null,
      linhasRetornadas: 1,
      duracaoMs: 1,
    });
    const auditoria = new ListarAuditoria(ctx.acessos, ctx.audit);
    const audB = await withBound(b.usuarioId, b.acessoId, () => auditoria.execute(b.usuarioId, {}));
    expect(audB.entradas).toHaveLength(0);
    expect(created.skill.id).toBeTruthy();
  });

  it("adicionar_acesso devolve setup novo e não troca o catálogo da sessão atual", async () => {
    const ctx = repos();
    const a = await registrar(ctx, "add@b.com", "tok-add-a-1111");
    const hashAntes = (await ctx.acessos.findById(a.acessoId))!.tokenHash;
    const added = await withBound(a.usuarioId, a.acessoId, () =>
      new AdicionarAcesso(
        ctx.acessos,
        ctx.plug,
        stubSessions(),
        crypto,
        ctx.setup,
        "http://localhost",
        0,
        undefined,
        ctx.setupPersistent,
      ).execute(a.usuarioId, { agentId, dialeto: "mssql", clientToken: "tok-add-b-2222" }),
    );
    expect(added.setupCode).toBeTruthy();
    expect(added.setupUrl).toContain("/setup/");
    expect(JSON.stringify(added)).not.toMatch(/tok-add/);
    expect(added).not.toHaveProperty("token");
    const tokenNovo = ctx.setup.consume(added.setupCode);
    expect(tokenNovo).toBeTruthy();
    expect((await ctx.acessos.findById(a.acessoId))!.tokenHash).toBe(hashAntes);
    const listados = await withBound(a.usuarioId, a.acessoId, () =>
      new ListarAcessos(ctx.acessos).execute(a.usuarioId),
    );
    expect(listados.acessos).toHaveLength(1);
    expect(listados.acessos[0]?.id).toBe(a.acessoId);
    expect(added.acesso.id).not.toBe(a.acessoId);
  });

  it("rotacionar_token_mcp invalida só o Bearer da persona atual", async () => {
    const ctx = repos();
    const a = await registrar(ctx, "rot@b.com", "tok-rot-a-1111");
    const b = await registrar(ctx, "rot@b.com", "tok-rot-b-2222");
    const hashA = (await ctx.acessos.findById(a.acessoId))!.tokenHash;
    const hashB = (await ctx.acessos.findById(b.acessoId))!.tokenHash;
    const rotated = await withBound(a.usuarioId, a.acessoId, () =>
      new RotacionarTokenMcp(
        ctx.acessos,
        crypto,
        ctx.setup,
        "http://localhost",
        0,
        ctx.setupPersistent,
      ).execute(a.usuarioId),
    );
    expect(rotated.setupCode).toBeTruthy();
    expect(rotated.hint).toMatch(/antes de reiniciar/);
    expect(rotated.hint).toMatch(/7 dias/);
    const novo = ctx.setup.consume(rotated.setupCode);
    expect(novo).toBeTruthy();
    expect((await ctx.acessos.findById(a.acessoId))!.tokenHash).not.toBe(hashA);
    expect((await ctx.acessos.findById(a.acessoId))!.tokenHash).toBe(crypto.sha256Hex(novo!));
    expect((await ctx.acessos.findById(b.acessoId))!.tokenHash).toBe(hashB);
    expect(await ctx.acessos.findByTokenHash(hashA)).toBeNull();
    expect((await ctx.acessos.findByTokenHash(hashB))?.id).toBe(b.acessoId);
  });

  it("registrar_acesso com e-mail existente emite token novo", async () => {
    const ctx = repos();
    const primeiro = await registrar(ctx, "ex@b.com", "tok-ex-a-1111");
    const tokenA = ctx.setup.consume(primeiro.setupCode!);
    const segundo = await registrar(ctx, "ex@b.com", "tok-ex-b-2222");
    expect(segundo.setupCode).toBeTruthy();
    expect(segundo.setupUrl).toBeTruthy();
    const tokenB = ctx.setup.consume(segundo.setupCode!);
    expect(tokenB).not.toBe(tokenA);
  });

  it("Bearer bound recusa acessoId de irmão e não apaga a outra persona", async () => {
    const ctx = repos();
    const a = await registrar(ctx, "rm@b.com", "tok-rm-a-1111");
    const b = await registrar(ctx, "rm@b.com", "tok-rm-b-2222");
    await withBound(a.usuarioId, a.acessoId, async () => {
      await expect(
        new RemoverAcesso(ctx.acessos, {
          grafo: ctx.grafo,
          skills: ctx.skills,
          anotacoes: ctx.anotacoes,
          aprendizado: ctx.aprendizado,
        }).execute(a.usuarioId, { acessoId: b.acessoId }),
      ).rejects.toMatchObject({ code: ERROR_CODES.VALIDATION_ERROR });
    });
    expect(await ctx.acessos.findById(b.acessoId)).not.toBeNull();
    await withBound(a.usuarioId, a.acessoId, async () => {
      await expect(
        new AtualizarPersona(ctx.acessos).execute(a.usuarioId, {
          acessoId: b.acessoId,
          nomePersona: "Invasor",
          confirmadoPeloUsuario: true,
        }),
      ).rejects.toBeInstanceOf(DomainError);
    });
  });

  it("registrar_acesso e adicionar_acesso recusam o mesmo trio com CONFLICT", async () => {
    const ctx = repos();
    const primeiro = await registrar(ctx, "dup@b.com", "tok-dup-a-1111");
    await expect(registrar(ctx, "dup@b.com", "tok-dup-a-1111")).rejects.toMatchObject({
      code: ERROR_CODES.CONFLICT,
    });
    await withBound(primeiro.usuarioId, primeiro.acessoId, async () => {
      await expect(
        new AdicionarAcesso(
          ctx.acessos,
          ctx.plug,
          stubSessions(),
          crypto,
          ctx.setup,
          "http://localhost",
          0,
          undefined,
          ctx.setupPersistent,
        ).execute(primeiro.usuarioId, {
          agentId,
          dialeto: "mssql",
          clientToken: "tok-dup-a-1111",
        }),
      ).rejects.toMatchObject({ code: ERROR_CODES.CONFLICT });
    });
  });

  it("setup persistido sobrevive memória vazia; rotate consome one-shot do mcp_setup", async () => {
    const ctx = repos();
    const created = await registrar(ctx, "persist@b.com", "tok-persist-111");
    const emptyMem = new SetupCodeStore();
    expect(emptyMem.consume(created.setupCode!)).toBeNull();
    const token = await ctx.setupPersistent.consume(created.setupCode!);
    expect(token).toBeTruthy();
    expect(await ctx.setupPersistent.consume(created.setupCode!)).toBeNull();
    expect((await ctx.acessos.findByTokenHash(crypto.sha256Hex(token!)))?.id).toBe(
      created.acessoId,
    );

    const rotated = await withBound(created.usuarioId, created.acessoId, () =>
      new RotacionarTokenMcp(
        ctx.acessos,
        crypto,
        ctx.setup,
        "http://localhost",
        0,
        ctx.setupPersistent,
      ).execute(created.usuarioId),
    );
    const afterRestart = new SetupCodeStore();
    expect(afterRestart.consume(rotated.setupCode)).toBeNull();
    const novo = await ctx.setupPersistent.consume(rotated.setupCode);
    expect(novo).toBeTruthy();
    expect((await ctx.acessos.findById(created.acessoId))!.tokenHash).toBe(crypto.sha256Hex(novo!));
    expect(await ctx.setupPersistent.consume(rotated.setupCode)).toBeNull();
  });
});
