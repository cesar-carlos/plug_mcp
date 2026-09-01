import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { ExportarAnexo } from "../../src/application/use-cases/exportar-anexo.js";
import { ConsultarDados } from "../../src/application/use-cases/consultar.js";
import { InspecionarConsulta } from "../../src/application/use-cases/inspecionar.js";
import { RegistrarAcesso } from "../../src/application/use-cases/cofre.js";
import {
  isErroTetoConversao,
  SharpPdfkitAnexoConverter,
} from "../../src/infrastructure/anexo/converter-anexo.js";
import { MemoryAnexoHandleStore } from "../../src/infrastructure/anexo/memory-anexo-handle.js";
import { ERROR_CODES } from "../../src/domain/errors/error-codes.js";
import { NodeCryptoAdapter } from "../../src/infrastructure/crypto/node-crypto.adapter.js";
import { SetupCodeStore } from "../../src/infrastructure/http/setup-code-store.js";
import {
  InMemoryAcessoRepository,
  InMemoryAprendizadoRepository,
  InMemoryAuditLog,
  InMemoryGrafoRepository,
  InMemorySkillRepository,
  InMemoryUsuarioRepository,
} from "../../src/infrastructure/persistence/memory/memory-cofre.js";
import { FakePlugServer } from "../helpers/fake-plug-server.js";
import { jsonResult } from "../../src/infrastructure/mcp/tool-result.js";
import {
  ANEXO_EXPORT_KIND,
  ANEXO_HANDLE_MAX_PER_USER,
  ANEXO_LIMIT_INPUT_PIXELS,
} from "../../src/domain/entities/anexo.js";
import type { LoggerPort } from "../../src/domain/ports/logger.port.js";
import type { QueryResultCachePort } from "../../src/domain/ports/query-result-cache.port.js";
import type { SensibilidadeColuna } from "../../src/domain/entities/privacidade.js";
import { escopoFromSqlModelo } from "../../src/application/use-cases/shared/escopo-from-modelo.js";
import { parseSqlModelo } from "../../src/application/use-cases/shared/sql-modelo.js";
import { MemoryQueryResultCache } from "../../src/infrastructure/cache/query-result-cache.js";
import { DomainError } from "../../src/domain/errors/domain-error.js";

const crypto = new NodeCryptoAdapter(
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
);
const agentId = "11111111-1111-4111-8111-111111111111";
const silentLogger: LoggerPort = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  child: () => silentLogger,
};

const jpegBytes = async (): Promise<Buffer> =>
  sharp({
    create: { width: 8, height: 8, channels: 3, background: { r: 200, g: 10, b: 10 } },
  })
    .jpeg()
    .toBuffer();

const zipBytes = (): Buffer =>
  Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(40, 0)]);

describe("exportar_anexo", () => {
  it("converte jpeg→png com sharp e recusa zip", async () => {
    const converter = new SharpPdfkitAnexoConverter();
    const jpeg = await jpegBytes();
    const png = await converter.converter({ bytes: jpeg, mimeDestino: "image/png" });
    expect(png.mime).toBe("image/png");
    expect(png.data[0]).toBe(0x89);
    await expect(
      converter.converter({ bytes: zipBytes(), mimeDestino: "image/jpeg" }),
    ).rejects.toMatchObject({
      code: ERROR_CODES.MIDIA_TIPO_RECUSADO,
      source: "mcp",
      stage: "anexo",
    });
    const jpegAgain = await converter.converter({ bytes: jpeg, mimeDestino: "image/jpeg" });
    expect(jpegAgain.mime).toBe("image/jpeg");
  });

  it("recusa handle de outro usuarioId e anexo pessoal", async () => {
    const store = new MemoryAnexoHandleStore("secret-anexo-hmac-key-32bytes-min");
    const jpeg = await jpegBytes();
    const handleA = store.put({
      usuarioId: "user-a",
      acessoId: "acesso-a",
      bytes: jpeg,
      coluna: "foto",
      sensibilidade: "livre",
      origem: "consultar_dados",
    });
    expect(store.get(handleA, "user-b")).toBeNull();
    const handlePessoal = store.put({
      usuarioId: "user-a",
      acessoId: "acesso-a",
      bytes: new Uint8Array(),
      coluna: "foto_rg",
      sensibilidade: "pessoal" satisfies SensibilidadeColuna,
      origem: "consultar_dados",
    });
    expect(store.get(handlePessoal, "user-a")?.sensibilidade).toBe("pessoal");
  });

  it("consultar_dados devolve stub e exportar_anexo gera imagem MCP", async () => {
    const plug = new FakePlugServer();
    plug.approve(agentId);
    const jpeg = await jpegBytes();
    plug.sqlImpl = async () => ({
      columns: ["foto"],
      columnsMetadata: [{ name: "foto", type: "image", nullable: true }],
      rows: [{ foto: jpeg.toString("base64") }],
    });
    const usuarios = new InMemoryUsuarioRepository();
    const acessos = new InMemoryAcessoRepository();
    const skills = new InMemorySkillRepository();
    const audit = new InMemoryAuditLog();
    const anexos = new MemoryAnexoHandleStore("secret-anexo-hmac-key-32bytes-min");
    const created = await new RegistrarAcesso(
      usuarios,
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
    const consultar = new ConsultarDados(
      acessos,
      skills,
      plug,
      sessions,
      crypto,
      audit,
      500,
      5000,
      { aprendizado: new InMemoryAprendizadoRepository(), anexos },
    );
    const skill = await skills.create({
      agentId,
      slug: "fotos",
      nome: "Fotos",
      descricao: "anexos",
      sqlModelo: "SELECT p.foto FROM produto p WHERE p.codprod = :codigo",
      autorUsuarioId: created.usuarioId,
    });
    await skills.setStatus(skill.id, "publicada");
    const result = await consultar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      pergunta: "mostra a foto",
      skillId: skill.id,
      params: { codigo: 1 },
    });
    const cell = result.rows[0]?.foto as { kind?: string; handle?: string; truncated?: boolean };
    expect(cell.kind).toBe("anexo");
    expect(cell.truncated).toBe(true);
    expect(cell.handle).toMatch(/^[0-9a-f-]{36}\./i);
    expect(JSON.stringify(result.rows)).not.toContain(jpeg.toString("base64").slice(0, 32));
    expect(result.avisos.some((item) => item.code === "ANEXO")).toBe(true);

    const exportar = new ExportarAnexo(
      acessos,
      skills,
      anexos,
      new SharpPdfkitAnexoConverter(),
      plug,
      sessions,
      crypto,
      audit,
      silentLogger,
    );
    const exported = await exportar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      handle: cell.handle,
      mimeDestino: "image/jpeg",
    });
    expect(exported.kind).toBe(ANEXO_EXPORT_KIND);
    expect(exported.mime).toBe("image/jpeg");
    const mcp = jsonResult(exported);
    expect(mcp.content.some((item) => item.type === "image")).toBe(true);
    expect(mcp.structuredContent).not.toHaveProperty("data");
    expect(JSON.stringify(mcp.structuredContent ?? {})).not.toContain("data");

    await expect(
      exportar.execute(created.usuarioId, {
        acessoId: created.acessoId,
        handle: "nao-e-um-handle",
        mimeDestino: "image/jpeg",
      }),
    ).rejects.toMatchObject({
      code: ERROR_CODES.MIDIA_ORIGEM_INVALIDA,
      source: "mcp",
      stage: "anexo",
    });

    const pessoal = anexos.put({
      usuarioId: created.usuarioId,
      acessoId: created.acessoId,
      bytes: jpeg,
      coluna: "foto_cpf",
      sensibilidade: "pessoal",
      origem: "consultar_dados",
    });
    await expect(
      exportar.execute(created.usuarioId, {
        acessoId: created.acessoId,
        handle: pessoal,
        mimeDestino: "image/jpeg",
      }),
    ).rejects.toMatchObject({
      code: ERROR_CODES.PRIVACIDADE_NEGADA,
      nextAction: "consultar_dados",
    });

    const outroAcesso = anexos.put({
      usuarioId: created.usuarioId,
      acessoId: "acesso-outro",
      bytes: jpeg,
      coluna: "foto",
      sensibilidade: "livre",
      origem: "consultar_dados",
    });
    await expect(
      exportar.execute(created.usuarioId, {
        acessoId: created.acessoId,
        handle: outroAcesso,
        mimeDestino: "image/jpeg",
      }),
    ).rejects.toMatchObject({
      code: ERROR_CODES.MIDIA_ORIGEM_INVALIDA,
      source: "mcp",
      stage: "anexo",
    });
  });

  it("recusa SVG e PDF→jpeg", async () => {
    const converter = new SharpPdfkitAnexoConverter();
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"></svg>');
    await expect(
      converter.converter({ bytes: svg, mimeDestino: "image/jpeg" }),
    ).rejects.toMatchObject({
      code: ERROR_CODES.MIDIA_TIPO_RECUSADO,
      source: "mcp",
      stage: "anexo",
    });
    const jpeg = await jpegBytes();
    const pdf = await converter.converter({ bytes: jpeg, mimeDestino: "application/pdf" });
    expect(pdf.mime).toBe("application/pdf");
    await expect(
      converter.converter({ bytes: pdf.data, mimeDestino: "image/jpeg" }),
    ).rejects.toMatchObject({
      code: ERROR_CODES.MIDIA_TIPO_RECUSADO,
      source: "mcp",
    });
  });

  it("estouro de pixels/teto vira MIDIA_TETO, não ilegível", () => {
    expect(isErroTetoConversao(new Error("Input image exceeds pixel limit"))).toBe(true);
    expect(isErroTetoConversao(new Error("unsupported image format"))).toBe(false);
  });

  it("limitInputPixels no converter vira MIDIA_TETO", async () => {
    const converter = new SharpPdfkitAnexoConverter();
    const side = Math.floor(Math.sqrt(ANEXO_LIMIT_INPUT_PIXELS)) + 1;
    const huge = await sharp({
      create: {
        width: side,
        height: side,
        channels: 3,
        background: { r: 0, g: 0, b: 0 },
      },
      limitInputPixels: false,
    })
      .jpeg({ quality: 40 })
      .toBuffer();
    try {
      await converter.converter({ bytes: huge, mimeDestino: "image/jpeg" });
      expect.fail("esperava MIDIA_TETO");
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      const err = error as DomainError;
      expect(err.code).toBe(ERROR_CODES.MIDIA_TETO);
      expect(err.source).toBe("mcp");
      expect(err.stage).toBe("anexo");
    }
  }, 30_000);

  it("cap de handles é por usuarioId; TTL usa clock injetável", async () => {
    const jpeg = await jpegBytes();
    let now = 1_000;
    const anexos = new MemoryAnexoHandleStore(
      "secret-anexo-hmac-key-32bytes-min",
      1_000,
      () => now,
    );
    const put = (usuarioId: string, coluna: string): string =>
      anexos.put({
        usuarioId,
        acessoId: "acesso-a",
        bytes: jpeg,
        coluna,
        sensibilidade: "livre",
        origem: "consultar_dados",
      });
    const firstA = put("user-a", "c0");
    for (let i = 1; i < ANEXO_HANDLE_MAX_PER_USER; i++) {
      put("user-a", `c${String(i)}`);
    }
    const handleB = put("user-b", "foto-b");
    expect(anexos.get(firstA, "user-a")).not.toBeNull();
    put("user-a", "overflow");
    expect(anexos.get(firstA, "user-a")).toBeNull();
    expect(anexos.get(handleB, "user-b")).not.toBeNull();
    now = 3_000;
    expect(anexos.get(handleB, "user-b")).toBeNull();
  });

  it("inspeção + stub → export recusa; consultar_dados + pessoal no grafo continua PRIVACIDADE_NEGADA", async () => {
    const plug = new FakePlugServer();
    plug.approve(agentId);
    const jpeg = await jpegBytes();
    const usuarios = new InMemoryUsuarioRepository();
    const acessos = new InMemoryAcessoRepository();
    const skills = new InMemorySkillRepository();
    const grafo = new InMemoryGrafoRepository();
    const audit = new InMemoryAuditLog();
    const anexos = new MemoryAnexoHandleStore("secret-anexo-hmac-key-32bytes-min");
    const created = await new RegistrarAcesso(
      usuarios,
      acessos,
      plug,
      crypto,
      new SetupCodeStore(),
      "http://localhost",
      0,
    ).execute({
      email: "insp@b.com",
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
    const sqlModelo = "SELECT p.foto FROM produto p WHERE p.codprod = :codigo";
    const skill = await skills.create({
      agentId,
      slug: "fotos-insp",
      nome: "Fotos",
      descricao: "anexos",
      sqlModelo,
      escopo: escopoFromSqlModelo(parseSqlModelo(sqlModelo)),
      autorUsuarioId: created.usuarioId,
    });
    await skills.setStatus(skill.id, "publicada");
    plug.sqlImpl = async () => ({
      columns: ["foto"],
      columnsMetadata: [{ name: "foto", type: "image", nullable: true }],
      rows: [{ foto: jpeg.toString("base64") }],
    });
    const inspecionar = new InspecionarConsulta(
      acessos,
      skills,
      grafo,
      plug,
      sessions,
      crypto,
      audit,
      { anexos },
    );
    const fillCap = (coluna: string): string =>
      anexos.put({
        usuarioId: created.usuarioId,
        acessoId: created.acessoId,
        bytes: jpeg,
        coluna,
        sensibilidade: "livre",
        origem: "consultar_dados",
      });
    const firstCap = fillCap("c0");
    for (let i = 1; i < ANEXO_HANDLE_MAX_PER_USER; i++) {
      fillCap(`c${String(i)}`);
    }
    expect(anexos.get(firstCap, created.usuarioId)).not.toBeNull();
    const inspecao = await inspecionar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      skillId: skill.id,
      tabela: "produto",
      finalidade: "validar_tipo",
    });
    const stub = inspecao.rows[0]?.foto as { kind?: string; handle?: string; truncated?: boolean };
    expect(stub.kind).toBe("anexo");
    expect(stub.truncated).toBe(true);
    expect(stub.handle).toBeUndefined();
    expect(JSON.stringify(inspecao.rows)).not.toContain(jpeg.toString("base64").slice(0, 32));
    expect(anexos.get(firstCap, created.usuarioId)).not.toBeNull();
    const leftover = anexos.put({
      usuarioId: created.usuarioId,
      acessoId: created.acessoId,
      bytes: jpeg,
      coluna: "foto",
      sensibilidade: "livre",
      origem: "inspecionar_consulta",
    });
    const exportar = new ExportarAnexo(
      acessos,
      skills,
      anexos,
      new SharpPdfkitAnexoConverter(),
      plug,
      sessions,
      crypto,
      audit,
      silentLogger,
    );
    await expect(
      exportar.execute(created.usuarioId, {
        acessoId: created.acessoId,
        handle: leftover,
        mimeDestino: "image/jpeg",
      }),
    ).rejects.toMatchObject({
      code: ERROR_CODES.MIDIA_ORIGEM_INVALIDA,
      source: "mcp",
      stage: "anexo",
    });

    const { tabela } = await grafo.mergeTabela({
      agentId,
      nome: "produto",
      origem: "validado_execucao",
      autorUsuarioId: created.usuarioId,
    });
    await grafo.mergeColuna({
      tabelaId: tabela.id,
      nome: "foto",
      tipo: "image",
      sensibilidade: "pessoal",
      origem: "confirmado_usuario",
      autorUsuarioId: created.usuarioId,
    });
    const consultar = new ConsultarDados(
      acessos,
      skills,
      plug,
      sessions,
      crypto,
      audit,
      500,
      5000,
      { aprendizado: new InMemoryAprendizadoRepository(), anexos, grafo },
    );
    await expect(
      consultar.execute(created.usuarioId, {
        acessoId: created.acessoId,
        pergunta: "mostra a foto",
        skillId: skill.id,
        params: { codigo: 1 },
      }),
    ).rejects.toMatchObject({
      code: ERROR_CODES.PRIVACIDADE_NEGADA,
      nextAction: "consultar_dados",
    });
  });

  it("resultado com stub de anexo não vai ao cache de query", async () => {
    const plug = new FakePlugServer();
    plug.approve(agentId);
    const jpeg = await jpegBytes();
    plug.sqlImpl = async () => ({
      columns: ["total", "foto"],
      columnsMetadata: [
        { name: "total", type: "int", nullable: false },
        { name: "foto", type: "image", nullable: true },
      ],
      rows: [{ total: 1, foto: jpeg.toString("base64") }],
    });
    const usuarios = new InMemoryUsuarioRepository();
    const acessos = new InMemoryAcessoRepository();
    const skills = new InMemorySkillRepository();
    const audit = new InMemoryAuditLog();
    const anexos = new MemoryAnexoHandleStore("secret-anexo-hmac-key-32bytes-min");
    const inner = new MemoryQueryResultCache();
    const sets: string[] = [];
    const cache: QueryResultCachePort = {
      get: (key) => inner.get(key),
      set: async (key, value, ttlMs) => {
        sets.push(key);
        await inner.set(key, value, ttlMs);
      },
      deleteByPrefix: (prefix) => inner.deleteByPrefix(prefix),
    };
    const created = await new RegistrarAcesso(
      usuarios,
      acessos,
      plug,
      crypto,
      new SetupCodeStore(),
      "http://localhost",
      0,
    ).execute({
      email: "cache@b.com",
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
    const sqlModelo =
      "SELECT SUM(p.qtde) AS total, MAX(p.foto) AS foto FROM produto p WHERE p.codprod > 0";
    const consultar = new ConsultarDados(
      acessos,
      skills,
      plug,
      sessions,
      crypto,
      audit,
      500,
      5000,
      { aprendizado: new InMemoryAprendizadoRepository(), anexos, cache, cacheTtlMs: 60_000 },
    );
    const skill = await skills.create({
      agentId,
      slug: "fotos-agg",
      nome: "Fotos agg",
      descricao: "anexos",
      sqlModelo,
      escopo: escopoFromSqlModelo(parseSqlModelo(sqlModelo)),
      autorUsuarioId: created.usuarioId,
    });
    await skills.setStatus(skill.id, "publicada");
    const result = await consultar.execute(created.usuarioId, {
      acessoId: created.acessoId,
      pergunta: "total e foto",
      skillId: skill.id,
    });
    const cell = result.rows[0]?.foto as { kind?: string; handle?: string };
    expect(cell.kind).toBe("anexo");
    expect(cell.handle).toBeTruthy();
    expect(sets).toHaveLength(0);
  });
});
