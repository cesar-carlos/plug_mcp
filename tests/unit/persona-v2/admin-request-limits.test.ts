import { DomainError } from "../../../src/domain/errors/domain-error.js";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { createPersonaAdministrationApp } from "../../../src/infrastructure/http/persona-v2-admin.js";
import type { PersonaAdministration } from "../../../src/application/persona-v2/administration.js";
import { NodeCryptoAdapter } from "../../../src/infrastructure/crypto/node-crypto.adapter.js";
import { TOKEN_JSON_BYTES } from "../../../src/domain/persona-v2/admin-request-limits.js";
import { SilentTestLogger } from "../../helpers/silent-logger.js";

const personaId = randomUUID(),
  tokenId = randomUUID();
const base = `/api/admin/personas/${personaId}/tokens`;
const permissions = {
  sourceIds: [],
  externalOperationIds: [],
  administrative: [],
  skills: Array.from({ length: 400 }, () => ({
    skillId: randomUUID(),
    capabilities: ["consultar", "campo:" + "a".repeat(100)],
    effects: ["select"],
    requireHumanApproval: false,
  })),
};
const body = { name: "Teste sintético", expiresAt: null, permissions, delegation: permissions };

function fixture() {
  const logger = new SilentTestLogger();
  const administration = {
    login: vi
      .fn()
      .mockResolvedValue({ sessionId: "a".repeat(43), expiresAt: new Date(Date.now() + 60000) }),
    issueToken: vi.fn().mockResolvedValue({ tokenId, bearer: "synthetic" }),
    changeToken: vi.fn().mockResolvedValue({}),
  };
  const app = createPersonaAdministrationApp({
    logger,
    administration: administration as unknown as PersonaAdministration,
    crypto: new NodeCryptoAdapter("a".repeat(64)),
    publicBaseUrl: "http://localhost",
    ready: async () => true,
  });
  const agent = request.agent(app);
  async function login() {
    const response = await agent
      .post("/api/admin/login")
      .set("Host", "localhost")
      .set("Origin", "http://localhost")
      .send({ email: "test@example.com", password: "synthetic" });
    expect(response.status).toBe(200);
    return (response.body as { csrfToken: string }).csrfToken;
  }
  return { administration, agent, login, logger };
}

describe("limites HTTP administrativos de tokens", () => {
  it("correlaciona excesso com bytes seguros e ignora identificador enviado pelo cliente", async () => {
    const f = fixture();
    const payload = { secret: "private-marker" + "a".repeat(TOKEN_JSON_BYTES) };
    const response = await f.agent
      .post(base + "?private-query")
      .set("X-Request-ID", "private-header")
      .send(payload);
    const requestId = response.get("X-Request-ID")!;
    expect(requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(f.logger.warnings).toEqual([
      {
        message: "admin request too large",
        fields: {
          requestId,
          declaredBytes: Buffer.byteLength(JSON.stringify(payload)),
          limitBytes: TOKEN_JSON_BYTES,
        },
      },
      {
        message: "admin request rejected",
        fields: { requestId, route: "token.issue", status: 413, limitBytes: TOKEN_JSON_BYTES },
      },
    ]);
    expect(JSON.stringify(f.logger.warnings)).not.toMatch(/private|secret|capabilities/);
    const next = await f.agent.post(base).send(payload);
    expect(next.headers["x-request-id"]).not.toBe(requestId);
  });
  it.each([0, 1])("confere fronteira exata de bytes: teto + %i", async (extra) => {
    const f = fixture(),
      csrf = await f.login();
    const json = JSON.stringify(body);
    const payload = json + " ".repeat(TOKEN_JSON_BYTES - Buffer.byteLength(json) + extra);
    const response = await f.agent
      .post(base)
      .set("Host", "localhost")
      .set("Origin", "http://localhost")
      .set("x-csrf-token", csrf)
      .set("Content-Type", "application/json")
      .send(payload);
    expect(response.status).toBe(extra ? 413 : 201);
    expect(f.administration.issueToken).toHaveBeenCalledTimes(extra ? 0 : 1);
  });
  it.each(["", `/${tokenId}/editar`, `/${tokenId}/rotacionar`])(
    "aceita concessões maiores que 64 KiB em %s",
    async (suffix) => {
      const f = fixture(),
        csrf = await f.login();
      const payload = suffix ? { ...body, expectedVersion: 1 } : body;
      expect(Buffer.byteLength(JSON.stringify(payload))).toBeGreaterThan(65536);
      const response = await f.agent
        .post(base + suffix)
        .set("Host", "localhost")
        .set("Origin", "http://localhost")
        .set("x-csrf-token", csrf)
        .send(payload);
      expect(response.status).toBe(suffix ? 200 : 201);
      const method = suffix ? f.administration.changeToken : f.administration.issueToken;
      expect(method).toHaveBeenCalledExactlyOnceWith(
        "a".repeat(43),
        expect.objectContaining({ permissions, delegation: permissions }),
        ...(suffix ? [suffix.endsWith("rotacionar")] : []),
      );
    },
  );

  it.each(["", `/${tokenId}/editar`, `/${tokenId}/rotacionar`])(
    "recusa excesso sem chamar emissão ou alteração: %s",
    async (suffix) => {
      const f = fixture();
      const response = await f.agent
        .post(base + suffix)
        .send({ name: "á".repeat(TOKEN_JSON_BYTES) });
      expect(response.status).toBe(413);
      expect(response.body).toMatchObject({ error: { code: "REQUEST_TOO_LARGE" } });
      expect(response.headers["cache-control"]).toBe("no-store");
      expect(JSON.stringify(response.body)).not.toContain("ááá");
      expect(f.administration.issueToken).not.toHaveBeenCalled();
      expect(f.administration.changeToken).not.toHaveBeenCalled();
    },
  );

  it.each(["/api/admin/login", "/api/admin/personas", `${base}/${tokenId}/revogar`, "/mcp"])(
    "preserva 64 KiB em %s",
    async (path) => {
      const f = fixture();
      const response = await f.agent.post(path).send({ content: "a".repeat(65536) });
      expect(response.status).toBe(413);
      expect(response.body).toMatchObject({ error: { code: "REQUEST_TOO_LARGE" } });
    },
  );

  it("o limite maior não contorna sessão/CSRF", async () => {
    const f = fixture();
    const response = await f.agent
      .post(base)
      .set("Host", "localhost")
      .set("Origin", "http://localhost")
      .send(body);
    expect(response.status).toBe(403);
    expect(f.administration.issueToken).not.toHaveBeenCalled();
  });
});

it.each([
  ["PLUG_SERVER_TIMEOUT", "tempo limite"],
  ["AGENT_UNAVAILABLE", "indisponível"],
  ["PERMISSION_DENIED", "não autoriza"],
] as const)("console distingue falha %s sem expor upstream", async (code, message) => {
  const f = fixture();
  const csrf = await f.login();
  f.administration.issueToken.mockRejectedValueOnce(
    new DomainError({
      code,
      message: "private-upstream",
      hint: "private-secret",
      source: "plug_server_http",
    }),
  );
  const response = await f.agent
    .post(base)
    .set("Host", "localhost")
    .set("Origin", "http://localhost")
    .set("x-csrf-token", csrf)
    .send(body);
  expect(response.body.error.code).toBe(code);
  expect(response.body.error.message).toContain(message);
  expect(JSON.stringify(response.body)).not.toContain("private-");
  expect(f.logger.warnings).toContainEqual({
    message: "admin upstream request failed",
    fields: { requestId: response.get("X-Request-ID"), errorCode: code, status: response.status },
  });
  expect(f.administration.issueToken).toHaveBeenCalledTimes(1);
});
