import { randomUUID } from "node:crypto";
import pino from "pino";
import request from "supertest";
import { expect, it, vi } from "vitest";
import { DomainError } from "../../../src/domain/errors/domain-error.js";
import type { PersonaAdministration } from "../../../src/application/persona-v2/administration.js";
import { createPersonaAdministrationApp } from "../../../src/infrastructure/http/persona-v2-admin.js";
import { NodeCryptoAdapter } from "../../../src/infrastructure/crypto/node-crypto.adapter.js";
import { PinoLoggerAdapter } from "../../../src/infrastructure/logging/pino-logger.adapter.js";

it.each(["getClientProfile.queue", "private-secret"])(
  "503 conserva diagnóstico seguro com logger real: %s",
  async (stage) => {
    let output = "";
    const logger = new PinoLoggerAdapter(
      pino(
        {},
        {
          write: (line) => {
            output += line;
          },
        },
      ),
    );
    const issueToken = vi.fn().mockRejectedValue(
      new DomainError({
        code: "PLUG_SERVER_ERROR",
        source: "plug_server_http",
        stage,
        message: "private-secret",
        hint: "private-secret",
        details: {
          transportReason: "capacity",
          sql: "private-secret",
          token: "private-secret",
          httpStatus: 503,
        },
      }),
    );
    const app = createPersonaAdministrationApp({
      logger,
      crypto: new NodeCryptoAdapter("a".repeat(64)),
      publicBaseUrl: "http://localhost",
      ready: async () => true,
      administration: {
        login: async () => ({ sessionId: "a".repeat(43), expiresAt: new Date(Date.now() + 60000) }),
        issueToken,
      } as unknown as PersonaAdministration,
    });
    const agent = request.agent(app);
    const login = await agent
      .post("/api/admin/login")
      .set("Host", "localhost")
      .set("Origin", "http://localhost")
      .send({ email: "fixture@example.test", password: "synthetic" });
    const permissions = { sourceIds: [], externalOperationIds: [], skills: [], administrative: [] };
    const response = await agent
      .post(`/api/admin/personas/${randomUUID()}/tokens`)
      .set("Host", "localhost")
      .set("Origin", "http://localhost")
      .set("x-csrf-token", login.body.csrfToken)
      .send({ name: "fixture", expiresAt: null, permissions, delegation: permissions });
    expect(response.status).toBe(503);
    const entries = output
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    const upstream = entries.find((entry) => entry.errorCode === "PLUG_SERVER_ERROR");
    expect(upstream).toMatchObject({
      supportId: response.body.error.supportId,
      requestId: response.headers["x-request-id"],
      transportReason: "capacity",
      httpStatus: 503,
      source: "plug_server_http",
    });
    if (stage === "private-secret") expect(upstream).not.toHaveProperty("stage");
    else expect(upstream.stage).toBe(stage);
    expect(entries.every((entry) => entry.supportId === response.body.error.supportId)).toBe(true);
    expect(output + JSON.stringify(response.body)).not.toContain("private-secret");
    expect(issueToken).toHaveBeenCalledTimes(1);
  },
);
