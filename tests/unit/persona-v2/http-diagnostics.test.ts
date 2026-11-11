import express from "express";
import request from "supertest";
import pino from "pino";
import { expect, it } from "vitest";
import { adminRequestDiagnostics } from "../../../src/infrastructure/http/persona-admin-diagnostics.js";
import { PinoLoggerAdapter } from "../../../src/infrastructure/logging/pino-logger.adapter.js";
import { createPersonaV2McpHandler } from "../../../src/infrastructure/mcp/persona-v2-http.js";
import { personaMcpParserError } from "../../../src/infrastructure/mcp/persona-v2-protocol-error.js";

it("identifica leitura de publicação por rótulo fixo sem expor IDs ou query", async () => {
  let log = "";
  const logger = new PinoLoggerAdapter(
    pino(
      {},
      {
        write: (line) => {
          log += line;
        },
      },
    ),
  );
  const app = express();
  app.use(adminRequestDiagnostics(logger));
  app.get("/api/admin/personas/:persona/skills/:skill/publicacao", (_req, res) => {
    res.status(503).json({ error: { code: "PLUG_SERVER_ERROR" } });
  });
  const id = "11111111-1111-4111-8111-111111111111";
  const response = await request(app).get(
    `/api/admin/personas/${id}/skills/${id}/publicacao?secret=value`,
  );
  expect(JSON.parse(log)).toMatchObject({
    route: "admin.skill.publication",
    supportId: response.body.error.supportId,
    status: 503,
  });
  expect(log).not.toContain(id);
  expect(log).not.toContain("secret");
});

it.each(["missing", "malformed", "authority", "origin", "preparation"])(
  "MCP conserva o mesmo supportId no corpo, header e logger real: %s",
  async (mode) => {
    let log = "";
    const logger = new PinoLoggerAdapter(
      pino(
        {},
        {
          write: (line) => {
            log += line;
          },
        },
      ),
    );
    const app = express();
    app.use(adminRequestDiagnostics(logger));
    app.use(express.json());
    const catalog = { authenticate: async () => ({ personaId: "fixture" }) };
    const oauth =
      mode === "missing" || mode === "authority"
        ? {
            resolve: async () => {
              throw Error("secret-fixture");
            },
          }
        : undefined;
    const setups =
      mode === "preparation"
        ? {
            visible: async () => {
              throw Error("secret-fixture");
            },
          }
        : undefined;
    app.post(
      "/mcp/chatgpt",
      createPersonaV2McpHandler(
        catalog as unknown as Parameters<typeof createPersonaV2McpHandler>[0],
        "https://fixture.test",
        undefined,
        undefined,
        undefined,
        oauth as Parameters<typeof createPersonaV2McpHandler>[5],
        setups as unknown as Parameters<typeof createPersonaV2McpHandler>[6],
        undefined,
        undefined,
        logger,
      ),
    );
    const call = request(app)
      .post("/mcp/chatgpt")
      .set("Host", mode === "origin" ? "wrong.test" : "fixture.test")
      .set("X-Support-Id", "11111111-1111-4111-8111-111111111111");
    if (mode !== "missing")
      call.set(
        "Authorization",
        mode === "malformed" ? "Basic secret-fixture" : "Bearer secret-fixture",
      );
    const response = await call.send({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect(response.status).toBe(
      mode === "origin" ? 403 : mode === "authority" || mode === "preparation" ? 503 : 401,
    );
    expect(response.headers["x-support-id"]).toBe(response.body.error.supportId);
    expect(response.headers["x-support-id"]).not.toBe("11111111-1111-4111-8111-111111111111");
    const entries = log
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      errorCode:
        mode === "origin"
          ? "ORIGIN_DENIED"
          : mode === "authority"
            ? "AUTHORITY_UNAVAILABLE"
            : mode === "preparation"
              ? "MCP_REQUEST_FAILED"
              : "AUTHORIZATION_DENIED",
      stage: mode === "origin" || mode === "preparation" ? "request" : "authentication",
    });
    expect(entries.every((entry) => entry.supportId === response.body.error.supportId)).toBe(true);
    expect(log + JSON.stringify(response.body)).not.toContain("secret-fixture");
    if (mode === "missing")
      expect(response.headers["www-authenticate"]).toContain("oauth-protected-resource");
    if (mode === "authority") expect(response.headers).not.toHaveProperty("www-authenticate");
  },
);

it.each([false, true])(
  "parser MCP conserva supportId com logger real; oversized=%s",
  async (oversized) => {
    let log = "";
    const logger = new PinoLoggerAdapter(
      pino(
        {},
        {
          write: (line) => {
            log += line;
          },
        },
      ),
    );
    const app = express();
    app.use(adminRequestDiagnostics(logger));
    app.use(express.json({ limit: 128 }));
    app.use(personaMcpParserError(logger));
    const response = await request(app)
      .post("/mcp/chatgpt")
      .type("json")
      .send(
        oversized
          ? JSON.stringify({ secret: "private-fixture".repeat(20) })
          : '{"secret":"private-fixture"',
      );
    expect(response.status).toBe(oversized ? 413 : 400);
    expect(response.headers["x-support-id"]).toBe(response.body.error.supportId);
    const entries = log
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.supportId === response.body.error.supportId)).toBe(true);
    expect(entries[0]).toMatchObject({
      errorCode: oversized ? "REQUEST_TOO_LARGE" : "MCP_PROTOCOL_ERROR",
      stage: "protocol",
      protocolOrigin: "http_parser",
    });
    expect(log + JSON.stringify(response.body)).not.toContain("private-fixture");
  },
);

it("correlaciona 404, parser e recusa sem expor caminho, entrada ou existência do recurso", async () => {
  let log = "";
  const logger = new PinoLoggerAdapter(
    pino(
      {},
      {
        write: (line) => {
          log += line;
        },
      },
    ),
  );
  const app = express();
  app.use(adminRequestDiagnostics(logger));
  app.use(express.json());
  app.get("/api/admin/personas/:id", (_req, res) =>
    res.status(404).json({ error: { code: "NOT_FOUND" } }),
  );
  app.use(
    (_error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) =>
      res.status(400).json({ error: { code: "INVALID_INPUT" } }),
  );
  for (const id of ["missing-private", "inaccessible-private"]) {
    const res = await request(app)
      .get(`/api/admin/personas/${id}?secret=private`)
      .set("X-Support-Id", "private-client-id")
      .set("Authorization", "Bearer private");
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: { code: "NOT_FOUND", supportId: res.headers["x-support-id"] },
    });
    expect(res.headers["x-support-id"]).toBe(res.headers["x-request-id"]);
  }
  const unknown = await request(app).get("/private-scan.php?secret=private");
  expect(unknown.status).toBe(404);
  expect(unknown.headers["x-support-id"]).toMatch(/^[a-f0-9-]{36}$/);
  const parser = await request(app)
    .post("/api/admin/login")
    .set("Content-Type", "application/json")
    .send('{"private":');
  expect(parser.status).toBe(400);
  expect(parser.body.error.supportId).toBe(parser.headers["x-support-id"]);
  const entries = log
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  expect(entries.map((entry) => entry.reason)).toEqual([
    "resource_unavailable",
    "resource_unavailable",
    "unmatched_route",
    "request_failed",
  ]);
  expect(entries[2]).toMatchObject({ route: "http.other", method: "GET", status: 404 });
  expect(log).not.toMatch(/private|Authorization|Bearer|\.php|secret/);
});

it("preserva supportId do subsistema e não acrescenta corpo aos sucessos", async () => {
  const app = express();
  app.use(adminRequestDiagnostics());
  const id = "11111111-1111-4111-8111-111111111111";
  app.get("/api/admin/failure", (_req, res) => {
    res.setHeader("X-Support-Id", id);
    res.status(403).json({ error: { code: "AUTHORIZATION_DENIED" } });
  });
  app.get("/api/admin/ok", (_req, res) => res.json({ ok: true }));
  const failure = await request(app).get("/api/admin/failure");
  expect(failure.body.error.supportId).toBe(id);
  expect(failure.headers["x-support-id"]).toBe(id);
  const ok = await request(app).get("/api/admin/ok");
  expect(ok.body).toEqual({ ok: true });
  expect(ok.headers).not.toHaveProperty("x-support-id");
});

it("conserva correlação dentro de router montado sem revelar caminhos", async () => {
  const app = express(),
    router = express.Router();
  app.use(adminRequestDiagnostics());
  router.get("/hidden", (_req, res) => res.status(404).json({ error: { code: "NOT_FOUND" } }));
  app.use("/api/admin", router);
  const response = await request(app).get("/api/admin/hidden");
  expect(response.body.error.supportId).toBe(response.headers["x-support-id"]);
  expect(response.headers["x-support-id"]).toMatch(/^[a-f0-9-]{36}$/);
});
