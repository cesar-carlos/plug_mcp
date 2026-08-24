import { describe, expect, it } from "vitest";
import request from "supertest";
import { testConfig } from "../../src/config/env.js";
import { compose } from "../../src/composition/compose.js";
import { FakePlugServer } from "../helpers/fake-plug-server.js";
import { mcpRpc, parseMcpPayload, readToolResult } from "../helpers/mcp-rpc.js";

const agentId = "11111111-1111-4111-8111-111111111111";

const initialize = async (app: Awaited<ReturnType<typeof compose>>["app"], token?: string) => {
  const req = request(app)
    .post("/mcp")
    .set("Accept", "application/json, text/event-stream")
    .set("Content-Type", "application/json");
  if (token) {
    req.set("Authorization", `Bearer ${token}`);
  }
  const init = await req.send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "test", version: "0" },
    },
  });
  const rawSession = init.headers["mcp-session-id"];
  return {
    status: init.status,
    sessionId: typeof rawSession === "string" ? rawSession : undefined,
  };
};

describe("consultar_dados só com skill", () => {
  it("sem skillId falha; com skill publicada envia só o SQL da skill ao plug", async () => {
    const plug = new FakePlugServer();
    plug.approve(agentId);
    plug.sqlImpl = async () => ({ columns: ["codigo"], rows: [{ codigo: 1 }] });
    const { app, close, useCases } = await compose(testConfig(), { plug });
    try {
      const boot = await initialize(app);
      const registrar = await request(app)
        .post("/mcp")
        .set("Accept", "application/json, text/event-stream")
        .set("Content-Type", "application/json")
        .set("mcp-session-id", boot.sessionId ?? "")
        .send({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/call",
          params: {
            name: "registrar_acesso",
            arguments: {
              email: "client@example.com",
              senha: "secret-pass",
              agentId,
              dialeto: "sybase",
              clientToken: "tok-sql-123456",
            },
          },
        });
      const registered = readToolResult(parseMcpPayload(registrar));
      expect(registered.ok).toBe(true);
      if (!registered.ok) {
        return;
      }
      const setupCode = registered.json.setupCode as string;
      const setup = await request(app).get(`/setup/${setupCode}`);
      const token = /<pre>([^<]+)<\/pre>/.exec(setup.text)?.[1];
      expect(token).toBeTruthy();

      const authed = await initialize(app, token);
      const missing = await mcpRpc(
        app,
        token!,
        {
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: {
            name: "consultar_dados",
            arguments: { acessoId: registered.json.acessoId, sql: "SELECT 1 AS x" },
          },
        },
        authed.sessionId,
      );
      const missingResult = readToolResult(missing.payload);
      expect(missingResult.ok).toBe(false);

      await useCases.treinarComSql.execute(registered.json.usuarioId as string, {
        acessoId: registered.json.acessoId as string,
        sql: "SELECT p.codprod AS codigo FROM produto p WHERE p.codprod = :codigo",
        params: { codigo: 10 },
      });
      const created = await useCases.criarSkill.execute(registered.json.usuarioId as string, {
        acessoId: registered.json.acessoId as string,
        slug: "produtos",
        nome: "Produtos",
        descricao: "Lista produtos",
        sqlModelo: "SELECT p.codprod AS codigo FROM produto p WHERE p.codprod = :codigo",
        params: [{ nome: "codigo", descricao: "Código do produto", tipo: "number" }],
      });
      await useCases.validarSkill.execute(registered.json.usuarioId as string, {
        acessoId: registered.json.acessoId as string,
        skillId: created.skill.id,
        params: { codigo: 10 },
      });
      expect(plug.lastSql).toMatch(/_validacao/i);
      await useCases.publicarSkill.execute(registered.json.usuarioId as string, {
        acessoId: registered.json.acessoId as string,
        skillId: created.skill.id,
        confirmadoPeloUsuario: true,
      });

      plug.lastSql = null;
      const ok = await mcpRpc(
        app,
        token!,
        {
          jsonrpc: "2.0",
          id: 4,
          method: "tools/call",
          params: {
            name: "consultar_dados",
            arguments: {
              acessoId: registered.json.acessoId,
              skillId: created.skill.id,
              params: { codigo: 10 },
            },
          },
        },
        authed.sessionId,
      );
      const okResult = readToolResult(ok.payload);
      expect(okResult.ok).toBe(true);
      expect(plug.lastSql).toContain("produto");
      expect(plug.lastSql).not.toMatch(/select \*/i);
      expect(plug.lastParams).toEqual({ codigo: 10 });
    } finally {
      await close();
    }
  });
});
