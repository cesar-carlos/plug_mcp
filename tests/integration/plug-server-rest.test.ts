import { describe, expect, it } from "vitest";
import { ServiceTokenManager } from "../../src/infrastructure/plug-server/token-manager.js";
import {
  normalizeSqlResult,
  PlugServerRestAdapter,
} from "../../src/infrastructure/plug-server/plug-server-rest.adapter.js";
import {
  PinoLoggerAdapter,
  createPino,
} from "../../src/infrastructure/logging/pino-logger.adapter.js";

const logger = new PinoLoggerAdapter(createPino("silent", false));

describe("PlugServerRestAdapter", () => {
  it("faz login, envia Bearer e normaliza sql.execute", async () => {
    const calls: { url: string; auth?: string | null }[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      const auth = new Headers(init?.headers).get("authorization");
      calls.push({ url, auth });
      if (url.endsWith("/client-auth/login")) {
        return new Response(
          JSON.stringify({
            accessToken: "hdr.eyJleHAiOjk5OTk5OTk5OTl9.sig",
            refreshToken: "r1",
            success: true,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.endsWith("/agents/commands")) {
        return new Response(
          JSON.stringify({
            success: true,
            response: {
              item: { result: { columns: ["TotalVendas"], rows: [{ TotalVendas: 10 }] } },
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("no", { status: 404 });
    };

    const tokens = new ServiceTokenManager(
      "http://plug.test",
      "svc@test",
      "secret",
      logger,
      fetchImpl,
    );
    const adapter = new PlugServerRestAdapter("http://plug.test", tokens, logger, fetchImpl);
    const result = await adapter.executeSql({
      agentId: "3183a9f2-429b-46d6-a339-3580e5e5cb31",
      clientToken: "ct",
      sql: "SELECT 1",
    });
    expect(result.rows[0]?.TotalVendas).toBe(10);
    expect(calls.some((c) => c.url.includes("client-auth/login"))).toBe(true);
    expect(calls.some((c) => c.auth?.startsWith("Bearer "))).toBe(true);
  });

  it("renova em 401 e tenta de novo", async () => {
    let commands = 0;
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/login")) {
        return new Response(
          JSON.stringify({ accessToken: "a.eyJleHAiOjk5OTk5OTk5OTl9.b", refreshToken: "r" }),
          { status: 200 },
        );
      }
      if (url.endsWith("/refresh")) {
        return new Response(
          JSON.stringify({ accessToken: "c.eyJleHAiOjk5OTk5OTk5OTl9.d", refreshToken: "r2" }),
          { status: 200 },
        );
      }
      if (url.endsWith("/agents/commands")) {
        commands += 1;
        if (commands === 1)
          return new Response(JSON.stringify({ message: "expired" }), { status: 401 });
        return new Response(
          JSON.stringify({ response: { item: { result: { columns: ["x"], rows: [{ x: 1 }] } } } }),
          { status: 200 },
        );
      }
      return new Response("no", { status: 404 });
    };
    const tokens = new ServiceTokenManager(
      "http://plug.test",
      "svc@test",
      "secret",
      logger,
      fetchImpl,
    );
    await tokens.getAccessToken();
    const adapter = new PlugServerRestAdapter("http://plug.test", tokens, logger, fetchImpl);
    const result = await adapter.executeSql({
      agentId: "3183a9f2-429b-46d6-a339-3580e5e5cb31",
      clientToken: "ct",
      sql: "SELECT 1",
    });
    expect(result.rows[0]?.x).toBe(1);
    expect(commands).toBe(2);
  });

  it("mapeia AbortError de fetch para PLUG_SERVER_TIMEOUT", async () => {
    const fetchImpl: typeof fetch = async () => {
      throw Object.assign(new Error("aborted"), { name: "AbortError" });
    };
    const tokens = new ServiceTokenManager(
      "http://plug.test",
      "svc@test",
      "secret",
      logger,
      fetchImpl,
    );
    await expect(tokens.getAccessToken()).rejects.toMatchObject({ code: "PLUG_SERVER_TIMEOUT" });
  });

  it("GET 403 + pedido rejected vira state revoked no domínio", async () => {
    const agentId = "3183a9f2-429b-46d6-a339-3580e5e5cb31";
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith("/login")) {
        return new Response(
          JSON.stringify({ accessToken: "a.eyJleHAiOjk5OTk5OTk5OTl9.b", refreshToken: "r" }),
          { status: 200 },
        );
      }
      if (url.includes(`/client/me/agents/${agentId}`) && !url.includes("agent-access-requests")) {
        return new Response(JSON.stringify({ message: "denied" }), { status: 403 });
      }
      if (url.includes("/client/me/agent-access-requests")) {
        return new Response(
          JSON.stringify({
            requests: [{ agentId, status: "rejected" }],
            count: 1,
            total: 1,
          }),
          { status: 200 },
        );
      }
      return new Response("no", { status: 404 });
    };
    const tokens = new ServiceTokenManager(
      "http://plug.test",
      "svc@test",
      "secret",
      logger,
      fetchImpl,
    );
    const adapter = new PlugServerRestAdapter("http://plug.test", tokens, logger, fetchImpl);
    const status = await adapter.getAgentAccessStatus(agentId);
    expect(status.state).toBe("rejected");
  });

  it("infere colunas quando sql.execute devolve rows em array sem columns", () => {
    const result = normalizeSqlResult({
      response: { item: { result: { rows: [[1500.5]] } } },
    });
    expect(result.columns).toEqual(["col_0"]);
    expect(result.rows[0]?.col_0).toBe(1500.5);
  });
});
