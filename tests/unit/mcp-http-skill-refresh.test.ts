import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { testConfig } from "../../src/config/env.js";
import { PACOTE_VERSAO_ATUAL, escopoVazio } from "../../src/domain/entities/escopo.js";
import type { LoggerPort } from "../../src/domain/ports/logger.port.js";
import { createMcpHttpHandler } from "../../src/infrastructure/mcp/mcp-http.js";
import type { ToolUseCases } from "../../src/infrastructure/mcp/register-tools.js";
import {
  InMemoryAcessoRepository,
  InMemorySkillRepository,
} from "../../src/infrastructure/persistence/memory/memory-cofre.js";
import { parseMcpPayload } from "../helpers/mcp-rpc.js";

const silentLogger: LoggerPort = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  child: () => silentLogger,
};

const stubUseCases = {
  consultarDados: { execute: async () => ({ columns: [], rows: [] }) },
} as unknown as ToolUseCases;

const initBody = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "test", version: "0" },
  },
};

const toolsListBody = { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} };

describe("skill_* no mesmo mcp-session-id", () => {
  it("troca de Bearer (acessoId) refresca skill_* da persona nova", async () => {
    const acessos = new InMemoryAcessoRepository();
    const skills = new InMemorySkillRepository();
    const usuarioId = "11111111-1111-4111-8111-111111111111";
    const acessoA = await acessos.create({
      usuarioId,
      agentId: "11111111-1111-4111-8111-111111111111",
      dialeto: "mssql",
      nomeAmigavel: "a",
      clientTokenEnc: "x",
      clientTokenHash: "ha",
      tokenHash: "token-hash-a",
      tokenExpiresAt: null,
      statusAcesso: "approved",
    });
    const acessoB = await acessos.create({
      usuarioId,
      agentId: "11111111-1111-4111-8111-111111111111",
      dialeto: "mssql",
      nomeAmigavel: "b",
      clientTokenEnc: "y",
      clientTokenHash: "hb",
      tokenHash: "token-hash-b",
      tokenExpiresAt: null,
      statusAcesso: "approved",
    });
    const skill = await skills.create({
      acessoId: acessoA.id,
      slug: "vendas",
      nome: "Vendas",
      descricao: "lista vendas",
      sqlModelo: "SELECT 1 AS n WHERE 1=1",
      escopo: { ...escopoVazio(), pacoteVersao: PACOTE_VERSAO_ATUAL },
      autorUsuarioId: usuarioId,
    });
    await skills.setStatus(skill.id, "publicada");

    const mcp = createMcpHttpHandler({
      config: testConfig({ MCP_SKILL_TOOLS_ENABLED: true }),
      useCases: stubUseCases,
      logger: silentLogger,
      catalog: { acessos, skills },
      resolveBearer: async (token) => {
        if (token === "bearer-a") {
          return { usuarioId, acessoId: acessoA.id };
        }
        if (token === "bearer-b") {
          return { usuarioId, acessoId: acessoB.id };
        }
        return null;
      },
    });
    const app = express();
    app.use(express.json());
    app.all("/mcp", (req, res) => {
      void mcp.handle(req, res);
    });

    try {
      const init = await request(app)
        .post("/mcp")
        .set("Authorization", "Bearer bearer-a")
        .set("Accept", "application/json, text/event-stream")
        .set("Content-Type", "application/json")
        .send(initBody);
      expect(init.status).toBeLessThan(500);
      const sessionId = init.headers["mcp-session-id"]!;
      expect(sessionId).toBeTruthy();

      const listA = await request(app)
        .post("/mcp")
        .set("Authorization", "Bearer bearer-a")
        .set("Accept", "application/json, text/event-stream")
        .set("Content-Type", "application/json")
        .set("mcp-session-id", sessionId)
        .send(toolsListBody);
      const namesA =
        (parseMcpPayload(listA).result as { tools?: { name: string }[] } | undefined)?.tools?.map(
          (tool) => tool.name,
        ) ?? [];
      expect(namesA).toContain("skill_vendas");

      const listB = await request(app)
        .post("/mcp")
        .set("Authorization", "Bearer bearer-b")
        .set("Accept", "application/json, text/event-stream")
        .set("Content-Type", "application/json")
        .set("mcp-session-id", sessionId)
        .send(toolsListBody);
      const namesB =
        (parseMcpPayload(listB).result as { tools?: { name: string }[] } | undefined)?.tools?.map(
          (tool) => tool.name,
        ) ?? [];
      expect(namesB).not.toContain("skill_vendas");
    } finally {
      mcp.dispose();
    }
  });
});
