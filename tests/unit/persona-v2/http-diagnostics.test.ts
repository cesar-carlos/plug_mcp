import express from "express";
import request from "supertest";
import pino from "pino";
import { expect, it } from "vitest";
import { adminRequestDiagnostics } from "../../../src/infrastructure/http/persona-admin-diagnostics.js";
import { PinoLoggerAdapter } from "../../../src/infrastructure/logging/pino-logger.adapter.js";

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
