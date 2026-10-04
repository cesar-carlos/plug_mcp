import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import request from "supertest";
import {
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
  PROTOCOL_VERSION_META_KEY,
} from "@modelcontextprotocol/server";
import { compose } from "../../src/composition/compose.js";
import { testConfig } from "../../src/config/env.js";
import { FakePlugServer } from "../helpers/fake-plug-server.js";
import { registerAccessViaBrowser } from "../helpers/secure-setup.js";
import { parseMcpPayload } from "../helpers/mcp-rpc.js";

const meta = {
  [PROTOCOL_VERSION_META_KEY]: "2026-07-28",
  [CLIENT_INFO_META_KEY]: { name: "protocol-test", version: "1" },
  [CLIENT_CAPABILITIES_META_KEY]: {},
};
describe("MCP legado e moderno no mesmo /mcp", () => {
  it("descoberta moderna e guias públicos, schemas sem segredos e Bearer inválido recusado", async () => {
    const { app, close } = await compose(testConfig(), { plug: new FakePlugServer() });
    try {
      const rpc = (method: string, params: Record<string, unknown> = {}) => {
        const call = request(app)
          .post("/mcp")
          .set("Accept", "application/json, text/event-stream")
          .set("MCP-Protocol-Version", "2026-07-28")
          .set("MCP-Method", method);
        if (typeof params.name === "string") {
          call.set("MCP-Name", params.name);
        }
        if (typeof params.uri === "string") {
          call.set("MCP-Name", params.uri);
        }
        return call.send({ jsonrpc: "2.0", id: 1, method, params: { ...params, _meta: meta } });
      };
      const discovery = await rpc("server/discover");
      expect(discovery.status).toBe(200);
      expect(parseMcpPayload(discovery).result).toHaveProperty("supportedVersions", ["2026-07-28"]);
      const list = await rpc("tools/list");
      expect(list.status).toBe(200);
      const result = parseMcpPayload(list).result as {
        tools: {
          name: string;
          inputSchema: { properties: Record<string, unknown>; additionalProperties?: boolean };
        }[];
      };
      expect(result.tools.map((t) => t.name)).toEqual([
        "obter_treinamento_base",
        "registrar_acesso",
      ]);
      expect(
        result.tools.find((t) => t.name === "registrar_acesso")?.inputSchema.properties,
      ).toEqual({});
      expect(
        result.tools.find((t) => t.name === "registrar_acesso")?.inputSchema.additionalProperties,
      ).toBe(false);
      expect((await rpc("resources/read", { uri: "guia://dialeto/postgres" })).status).toBe(200);
      const baseCall = await rpc("tools/call", { name: "obter_treinamento_base", arguments: {} });
      expect(baseCall.status).toBe(200);
      const baseCallResult = parseMcpPayload(baseCall).result as { content: { text: string }[] };
      const baseTool = JSON.parse(baseCallResult.content[0]!.text) as {
        hash: string;
        versao: string;
        guiaDialeto?: unknown;
      };
      expect(baseTool.hash).toMatch(/^[a-f0-9]{64}$/);
      expect(baseTool.guiaDialeto).toBeUndefined();
      const baseResource = await rpc("resources/read", { uri: "guia://treinamento-base" });
      expect(
        JSON.parse(
          (parseMcpPayload(baseResource).result as { contents: { text: string }[] }).contents[0]!
            .text,
        ),
      ).toMatchObject({
        hash: baseTool.hash,
        versao: baseTool.versao,
      });

      expect((await rpc("tools/list").set("Authorization", "Bearer invalid")).status).toBe(401);
      expect((await rpc("tools/list").set("Origin", "null")).status).toBe(403);
      expect((await rpc("tools/list").set("Host", "attacker.invalid")).status).toBe(403);
      expect(
        (
          await request(app)
            .post("/mcp")
            .set("MCP-Protocol-Version", "2026-07-28")
            .type("text")
            .send("{} ")
        ).status,
      ).toBe(415);
    } finally {
      await close();
    }
  });
  it("sessão legada não aceita trocar Bearer nem elevar sessão pública", async () => {
    const plug = new FakePlugServer(),
      agentId = randomUUID();
    plug.approve(agentId);
    const { app, close, useCases } = await compose(testConfig(), { plug });
    try {
      const a = await registerAccessViaBrowser(app, useCases, {
        email: "protocol@example.com",
        senha: "test-password",
        agentId,
        dialeto: "postgres",
        clientToken: "synthetic-client-a",
      });
      const b = await registerAccessViaBrowser(app, useCases, {
        email: "protocol@example.com",
        senha: "test-password",
        agentId,
        dialeto: "postgres",
        clientToken: "synthetic-client-b",
      });
      const init = (token?: string) => {
        const call = request(app).post("/mcp").set("Accept", "application/json, text/event-stream");
        if (token) call.set("Authorization", `Bearer ${token}`);
        return call.send({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "legacy", version: "1" },
          },
        });
      };
      const session = (await init(a.token)).headers["mcp-session-id"]!;
      const bootstrap = (await init()).headers["mcp-session-id"]!;
      const call = (sid: string, token: string) =>
        request(app)
          .post("/mcp")
          .set("Accept", "application/json, text/event-stream")
          .set("Mcp-Session-Id", sid)
          .set("Authorization", `Bearer ${token}`)
          .send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
      expect((await call(session, b.token)).status).toBe(403);
      expect((await call(bootstrap, a.token)).status).toBe(403);
      expect((await call(session, a.token)).status).toBe(200);
      expect(
        (
          await request(app)
            .delete("/mcp")
            .set("Mcp-Session-Id", session)
            .set("Authorization", `Bearer ${a.token}`)
        ).status,
      ).toBe(200);
    } finally {
      await close();
    }
  });
});
