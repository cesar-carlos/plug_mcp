import { describe, expect, it } from "vitest";
import request from "supertest";
import { testConfig } from "../../src/config/env.js";
import { compose } from "../../src/composition/compose.js";
import { FakePlugServer } from "../helpers/fake-plug-server.js";

const agentId = "11111111-1111-4111-8111-111111111111";

describe("bootstrap MCP", () => {
  it("initialize e registrar_acesso sem Bearer; token só no GET /setup", async () => {
    const plug = new FakePlugServer();
    plug.approve(agentId);
    const { app, close } = await compose(testConfig(), { plug });
    try {
      const init = await request(app)
        .post("/mcp")
        .set("Accept", "application/json, text/event-stream")
        .set("Content-Type", "application/json")
        .send({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "test", version: "0" },
          },
        });
      expect(init.status).toBeLessThan(500);
      const sessionId = init.headers["mcp-session-id"];

      const call = await request(app)
        .post("/mcp")
        .set("Accept", "application/json, text/event-stream")
        .set("Content-Type", "application/json")
        .set("mcp-session-id", sessionId ?? "")
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
      expect(call.status).toBeLessThan(500);
      const text = JSON.stringify(call.body) + (call.text ?? "");
      expect(text).not.toContain("secret-pass");

      const denied = await request(app)
        .post("/mcp")
        .set("Accept", "application/json, text/event-stream")
        .set("Content-Type", "application/json")
        .send({
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: { name: "listar_acessos", arguments: {} },
        });
      expect(denied.status).toBe(401);
    } finally {
      await close();
    }
  });
});
