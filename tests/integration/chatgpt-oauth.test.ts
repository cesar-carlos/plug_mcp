import { createHash, randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { compose } from "../../src/composition/compose.js";
import { testConfig } from "../../src/config/env.js";
import { FakePlugServer } from "../helpers/fake-plug-server.js";
import { SilentTestLogger } from "../helpers/silent-logger.js";
import { completeBrowserSetup } from "../helpers/secure-setup.js";
import { parseMcpPayload } from "../helpers/mcp-rpc.js";
import { sessionContext } from "../../src/application/session-context.js";
import {
  CLIENT_CAPABILITIES_META_KEY,
  CLIENT_INFO_META_KEY,
  PROTOCOL_VERSION_META_KEY,
} from "@modelcontextprotocol/server";

const origin = "https://mcp.example.test",
  client = "https://chatgpt.com/oauth/client.json",
  redirect = "https://chatgpt.com/connector_platform_oauth_redirect";
const hidden = (html: string, name: string): string =>
  new RegExp(`name="${name}" value="([^"]+)"`).exec(html)?.[1] ?? "";
const fixture = async () => {
  const config = testConfig({
    PUBLIC_BASE_URL: origin,
    CHATGPT_OAUTH_ENABLED: true,
    CHATGPT_OAUTH_CLIENTS: { [client]: [redirect] },
    MCP_MAX_SESSIONS: 10,
    MCP_BOOTSTRAP_RATE_LIMIT_MAX: 10000,
  });
  const plug = new FakePlugServer(),
    aid = randomUUID();
  plug.approve(aid);
  const c = await compose(config, {
    plug,
    logger: new SilentTestLogger(),
    oauthClient: { validate: async () => undefined },
  });
  const result = await c.useCases.registrarAcesso.execute({
    email: "pilot@example.com",
    senha: "synthetic-pass",
    agentId: aid,
    clientToken: "hub-private",
    dialeto: "postgres",
    nomeAmigavel: "Piloto",
  });
  config.CHATGPT_OAUTH_ACCESS_IDS.push(result.acessoId);
  // O caminho público de setup continua sendo utilizado, sem expor credenciais na tool.
  const url = await sessionContext.run(
    { usuarioId: result.usuarioId, acessoId: result.acessoId },
    () => c.useCases.setupOperations!.begin("rotacionar", result.usuarioId),
  );
  const completed = await completeBrowserSetup(
    c.app,
    url.setupUrl,
    { email: "pilot@example.com", senha: "synthetic-pass" },
    origin,
  );
  if (!completed.token) throw new Error("manual token unavailable");
  const manual = completed.token;
  const verifier = "x".repeat(43);
  const authorization = {
    response_type: "code",
    client_id: client,
    redirect_uri: redirect,
    resource: `${origin}/mcp/chatgpt`,
    scope: "se7e:access",
    code_challenge_method: "S256",
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    state: "opaque-state",
  };
  const begin = async () => {
    const page = await request(c.app).get("/oauth/authorize").query(authorization);
    return {
      page,
      nonce: String(page.headers["set-cookie"]?.[0]).split(";")[0]!,
      id: hidden(page.text, "transaction"),
      csrf: hidden(page.text, "csrf"),
    };
  };
  const connect = async () => {
    const start = await begin();
    const consent = await request(c.app)
      .post("/oauth/authorize/authenticate")
      .set("Origin", origin)
      .set("Cookie", start.nonce)
      .type("form")
      .send({ transaction: start.id, csrf: start.csrf, token: manual });
    expect(consent.status).toBe(200);
    expect(consent.text).not.toContain(manual);
    const response = await request(c.app)
      .post("/oauth/authorize/consent")
      .set("Origin", origin)
      .set("Cookie", start.nonce)
      .type("form")
      .send({ transaction: start.id, csrf: hidden(consent.text, "csrf"), confirmed: "yes" });
    expect(response.status).toBe(303);
    const callback = new URL(response.headers.location!);
    expect(callback.searchParams.get("iss")).toBe(origin);
    expect(callback.searchParams.get("state")).toBe("opaque-state");
    const exchanged = await request(c.app)
      .post("/oauth/token")
      .type("form")
      .send({
        grant_type: "authorization_code",
        client_id: client,
        redirect_uri: redirect,
        resource: authorization.resource,
        code: callback.searchParams.get("code"),
        code_verifier: verifier,
      });
    expect(exchanged.status).toBe(200);
    return exchanged.body as { access_token: string; refresh_token: string };
  };
  const rpc = async (token: string, method: string, params: unknown = {}, sid?: string) => {
    const req = request(c.app)
      .post("/mcp/chatgpt")
      .set("Authorization", `Bearer ${token}`)
      .set("Accept", "application/json, text/event-stream")
      .set("Content-Type", "application/json");
    if (sid) req.set("mcp-session-id", sid);
    const res = await req.send({ jsonrpc: "2.0", id: 1, method, params });
    return { res, payload: parseMcpPayload(res) };
  };
  const initialize = (token: string) =>
    rpc(token, "initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "pilot", version: "1" },
    });
  return { ...c, config, plug, manual, begin, connect, rpc, initialize, result };
};

describe("ChatGPT OAuth HTTP/MCP", () => {
  it("revogação durante reautenticação de setup impede a chamada seguinte ao hub", async () => {
    const f = await fixture();
    try {
      const tokens = await f.connect(),
        init = await f.initialize(tokens.access_token);
      const setup = await f.rpc(
        tokens.access_token,
        "tools/call",
        { name: "rotacionar_token_mcp", arguments: {} },
        init.res.headers["mcp-session-id"],
      );
      const setupUrl = (
        JSON.parse((setup.payload.result as { content: { text: string }[] }).content[0]!.text) as {
          setupUrl: string;
        }
      ).setupUrl;
      const original = f.plug.login.bind(f.plug),
        status = vi.spyOn(f.plug, "getAgentAccessStatus");
      vi.spyOn(f.plug, "login").mockImplementationOnce(async (...args) => {
        await request(f.app)
          .post("/oauth/revoke")
          .type("form")
          .send({ client_id: client, token: tokens.access_token });
        return original(...args);
      });
      const completed = await completeBrowserSetup(
        f.app,
        setupUrl,
        { email: "pilot@example.com", senha: "synthetic-pass" },
        origin,
      );
      expect(completed.response.status).toBe(400);
      expect(completed.token).toBeUndefined();
      expect(status).not.toHaveBeenCalled();
    } finally {
      await f.close();
    }
  });
  it("descobre OAuth, exige token desde initialize e preserva endpoint manual", async () => {
    const f = await fixture();
    try {
      const discovery = await request(f.app).get(
        "/.well-known/oauth-protected-resource/mcp/chatgpt",
      );
      expect(discovery.body.authorization_servers).toEqual([origin]);
      const metadata = await request(f.app).get("/.well-known/oauth-authorization-server");
      expect(metadata.body.token_endpoint_auth_methods_supported).toEqual(["none"]);
      expect(metadata.body.registration_endpoint).toBeUndefined();
      const missing = await request(f.app).post("/mcp/chatgpt").send({});
      expect(missing.status).toBe(401);
      expect(missing.headers["www-authenticate"]).toContain("/mcp/chatgpt");
      expect((await f.initialize(f.manual)).res.status).toBe(401);
      const old = await request(f.app)
        .post("/mcp")
        .set("Accept", "application/json, text/event-stream")
        .send({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "old", version: "1" },
          },
        });
      expect(old.status).toBe(200);
    } finally {
      await f.close();
    }
  });
  it("formulário protege Origin/CSRF/cookie e rejeita parâmetros duplicados", async () => {
    const f = await fixture();
    try {
      const start = await f.begin();
      expect(start.page.headers["set-cookie"]?.[0]).toMatch(/HttpOnly/);
      expect(start.page.headers["set-cookie"]?.[0]).toMatch(/Secure/);
      expect(start.page.headers["cache-control"]).toBe("no-store");
      const base = { transaction: start.id, csrf: start.csrf, token: f.manual };
      expect(
        (
          await request(f.app)
            .post("/oauth/authorize/authenticate")
            .set("Cookie", start.nonce)
            .type("form")
            .send(base)
        ).status,
      ).toBe(403);
      expect(
        (
          await request(f.app)
            .post("/oauth/authorize/authenticate")
            .set("Origin", origin)
            .type("form")
            .send(base)
        ).status,
      ).toBe(400);
      expect((await request(f.app).get("/oauth/authorize?client_id=x&client_id=y")).status).toBe(
        400,
      );
      expect((await request(f.app).post("/oauth/token").send({})).status).toBe(415);
    } finally {
      await f.close();
    }
  });
  it("catálogo declara OAuth, perfil é estável e sessão não troca de concessão", async () => {
    const f = await fixture();
    try {
      const one = await f.connect(),
        two = await f.connect(),
        init = await f.initialize(one.access_token),
        sid = init.res.headers["mcp-session-id"]!;
      const list = await f.rpc(one.access_token, "tools/list", {}, sid),
        tools = (
          list.payload.result as {
            tools: { name: string; securitySchemes?: unknown; _meta?: Record<string, unknown> }[];
          }
        ).tools;
      expect(tools.find((t) => t.name === "get_profile")?._meta?.["openai/profile"]).toBe(true);
      expect(tools.every((t) => t._meta?.securitySchemes)).toBe(true);
      for (const tool of tools)
        expect(tool.securitySchemes).toEqual([{ type: "oauth2", scopes: ["se7e:access"] }]);
      const call = { name: "get_profile", arguments: {} };
      const profile = await f.rpc(one.access_token, "tools/call", call, sid);
      expect(JSON.stringify(profile.payload)).not.toContain("pilot@example.com");
      const id = (profile.payload.result as { structuredContent: { id: string } }).structuredContent
        .id;
      expect((await f.rpc(two.access_token, "tools/call", call, sid)).res.status).toBe(403);
      const refreshed = await request(f.app)
        .post("/oauth/token")
        .type("form")
        .send({ grant_type: "refresh_token", client_id: client, refresh_token: one.refresh_token });
      const after = await f.rpc(refreshed.body.access_token, "tools/call", call, sid);
      expect(
        (after.payload.result as { structuredContent: { id: string } }).structuredContent.id,
      ).toBe(id);
      const context = await f.rpc(
        refreshed.body.access_token,
        "tools/call",
        { name: "obter_contexto_sessao", arguments: {} },
        sid,
      );
      expect(JSON.stringify(context.payload)).toContain("postgres");
    } finally {
      await f.close();
    }
  });
  it("revogação própria entrega comprovante e bloqueia setup derivado", async () => {
    const f = await fixture();
    try {
      const tokens = await f.connect(),
        init = await f.initialize(tokens.access_token),
        sid = init.res.headers["mcp-session-id"]!;
      const setup = await f.rpc(
        tokens.access_token,
        "tools/call",
        { name: "rotacionar_token_mcp", arguments: {} },
        sid,
      );
      const text = (setup.payload.result as { content: { text: string }[] }).content[0]!.text;
      const url = JSON.parse(text) as { setupUrl: string };
      expect((await request(f.app).get(new URL(url.setupUrl).pathname)).status).toBe(200);
      const revoked = await f.rpc(
        tokens.access_token,
        "tools/call",
        { name: "revogar_conexao_chatgpt", arguments: { confirmadoPeloUsuario: true } },
        sid,
      );
      expect(
        JSON.parse((revoked.payload.result as { content: { text: string }[] }).content[0]!.text),
      ).toEqual({ success: true, revogada: true });
      expect((revoked.payload.result as { isError?: boolean }).isError).not.toBe(true);
      expect((await f.initialize(tokens.access_token)).res.status).toBe(401);
      expect((await request(f.app).get(new URL(url.setupUrl).pathname)).status).toBe(404);
      expect(
        (
          await request(f.app)
            .post("/oauth/revoke")
            .type("form")
            .send({ client_id: client, token: "unknown" })
        ).status,
      ).toBe(200);
    } finally {
      await f.close();
    }
  });
  it("protocolo moderno recompõe contexto, exige confirmação e preserva Bearer após rotação", async () => {
    const f = await fixture();
    try {
      const tokens = await f.connect();
      const rpc = async (token: string, method: string, params: Record<string, unknown> = {}) => {
        const req = request(f.app)
          .post("/mcp/chatgpt")
          .set("Authorization", `Bearer ${token}`)
          .set("Accept", "application/json, text/event-stream")
          .set("MCP-Protocol-Version", "2026-07-28")
          .set("MCP-Method", method);
        if (typeof params.name === "string") req.set("MCP-Name", params.name);
        if (typeof params.uri === "string") req.set("MCP-Name", params.uri);
        const res = await req.send({
          jsonrpc: "2.0",
          id: 1,
          method,
          params: {
            ...params,
            _meta: {
              [PROTOCOL_VERSION_META_KEY]: "2026-07-28",
              [CLIENT_INFO_META_KEY]: { name: "pilot", version: "1" },
              [CLIENT_CAPABILITIES_META_KEY]: {},
            },
          },
        });
        return { res, payload: parseMcpPayload(res) };
      };
      expect((await rpc(tokens.access_token, "server/discover")).res.status).toBe(200);
      const list = await rpc(tokens.access_token, "tools/list");
      const tools = (
        list.payload.result as {
          tools: { securitySchemes: unknown; _meta: Record<string, unknown> }[];
        }
      ).tools;
      for (const tool of tools) {
        expect(tool.securitySchemes).toEqual([{ type: "oauth2", scopes: ["se7e:access"] }]);
        expect(tool._meta.securitySchemes).toEqual(tool.securitySchemes);
      }
      const profile = await rpc(tokens.access_token, "tools/call", {
        name: "get_profile",
        arguments: {},
      });
      expect(profile.payload.result).toHaveProperty("structuredContent.id");
      const denied = await rpc(tokens.access_token, "tools/call", {
        name: "revogar_conexao_chatgpt",
        arguments: { confirmadoPeloUsuario: false },
      });
      expect(denied.payload.result).toHaveProperty("isError", true);
      const resource = await rpc(tokens.access_token, "resources/read", {
        uri: `persona://${f.result.acessoId}`,
      });
      expect(resource.res.status).toBe(200);
      const setup = await rpc(tokens.access_token, "tools/call", {
        name: "rotacionar_token_mcp",
        arguments: {},
      });
      const setupUrl = (
        JSON.parse((setup.payload.result as { content: { text: string }[] }).content[0]!.text) as {
          setupUrl: string;
        }
      ).setupUrl;
      const completed = await completeBrowserSetup(
        f.app,
        setupUrl,
        { email: "pilot@example.com", senha: "synthetic-pass" },
        origin,
      );
      expect(completed.response.status).toBe(200);
      expect(completed.token).toBeTruthy();
      expect(completed.token).not.toBe(f.manual);
      expect((await f.initialize(tokens.access_token)).res.status).toBe(401);
      const old = await request(f.app)
        .post("/mcp")
        .set("Authorization", `Bearer ${completed.token!}`)
        .set("Accept", "application/json, text/event-stream")
        .send({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "old", version: "1" },
          },
        });
      expect(old.status).toBe(200);
    } finally {
      await f.close();
    }
  });
  it("compartilha a quota global entre OAuth e Bearer, inclusive inicializações concorrentes", async () => {
    const f = await fixture();
    try {
      f.config.MCP_MAX_SESSIONS = 1;
      const tokens = await f.connect();
      const initializes = await Promise.all([
        f.initialize(tokens.access_token),
        f.initialize(tokens.access_token),
      ]);
      expect(initializes.map((result) => result.res.status).sort()).toEqual([200, 429]);
      const old = await request(f.app)
        .post("/mcp")
        .set("Authorization", `Bearer ${f.manual}`)
        .set("Accept", "application/json, text/event-stream")
        .send({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "old", version: "1" },
          },
        });
      expect(old.status).toBe(429);
    } finally {
      await f.close();
    }
  });
});
