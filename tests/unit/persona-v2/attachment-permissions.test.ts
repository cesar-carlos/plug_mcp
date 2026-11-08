import express from "express";
import request from "supertest";
import { expect, it, vi } from "vitest";
import { PersonaV2Error } from "../../../src/domain/persona-v2/model.js";
import { DomainError } from "../../../src/domain/errors/domain-error.js";
import { markCleanupFailure } from "../../../src/domain/errors/cleanup-failure.js";
import { PinoLoggerAdapter } from "../../../src/infrastructure/logging/pino-logger.adapter.js";
import pino from "pino";
import { registerPersonaAttachmentRoutes } from "../../../src/infrastructure/http/persona-v2-attachments.js";

it.each([false, true])(
  "download preserva erro do hub ou recusa local com limpeza falha (%s)",
  async (permission) => {
    const failure = markCleanupFailure(
      permission
        ? new PersonaV2Error("AUTHORIZATION_DENIED", "private-marker")
        : new DomainError({
            code: "PLUG_SERVER_ERROR",
            source: "plug_server_http",
            stage: "getPolicy.response",
            message: "private-marker",
            hint: "private-marker",
            details: { transportReason: "network", errno: "ECONNRESET", sql: "private-marker" },
          }),
    );
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
    const app = express();
    const read = vi.fn().mockRejectedValue(failure);
    registerPersonaAttachmentRoutes(app, {
      publicBaseUrl: "https://example.test",
      attachments: { read },
      catalog: { authenticate: async () => ({}) },
      logger,
    } as unknown as Parameters<typeof registerPersonaAttachmentRoutes>[1]);
    const response = await request(app)
      .get("/api/consumer/bearer/attachments/fixture")
      .set("Host", "example.test")
      .set("Authorization", "Bearer fixture")
      .expect(permission ? 403 : 503);
    const error = response.body.error;
    expect(error.code).toBe(permission ? "AUTHORIZATION_DENIED" : "PLUG_SERVER_ERROR");
    if (!permission)
      expect(error).toMatchObject({
        stage: "getPolicy.response",
        details: { transportReason: "network", errno: "ECONNRESET" },
      });
    expect(JSON.parse(output)).toMatchObject({
      supportId: error.supportId,
      cleanupFailed: true,
      errorCode: error.code,
    });
    expect(response.headers["x-support-id"]).toBe(error.supportId);
    expect(response.headers["www-authenticate"]).toBeUndefined();
    expect(output + JSON.stringify(error)).not.toContain("private-marker");
    expect(read).toHaveBeenCalledTimes(1);
  },
);

it.each(["oauth", "bearer"])(
  "separates invalid identity from denied download in %s",
  async (mode) => {
    const denied = new PersonaV2Error("AUTHORIZATION_DENIED", "fixture");
    const authenticate = vi.fn().mockResolvedValueOnce({}).mockRejectedValueOnce(denied);
    const read = vi.fn().mockRejectedValue(denied);
    const app = express();
    registerPersonaAttachmentRoutes(app, {
      publicBaseUrl: "https://example.test",
      attachments: { read },
      catalog: { authenticate },
      oauth: { resolve: authenticate },
    } as unknown as Parameters<typeof registerPersonaAttachmentRoutes>[1]);
    const get = () =>
      request(app)
        .get(`/api/consumer/${mode}/attachments/fixture`)
        .set("Host", "example.test")
        .set("Authorization", "Bearer fixture");
    const forbidden = await get().expect(403);
    expect(forbidden.headers["x-support-id"]).toBe(forbidden.body.error.supportId);
    expect(forbidden.body.error.message).toContain("Permissão");
    expect(forbidden.headers["www-authenticate"]).toBeUndefined();
    expect(forbidden.body.error.code).toBe("AUTHORIZATION_DENIED");
    const invalid = await get().expect(401);
    expect(invalid.headers["www-authenticate"]).toContain("Bearer");
    if (mode === "oauth") {
      expect(invalid.headers["www-authenticate"]).toContain('error="invalid_token"');
      expect(invalid.headers["www-authenticate"]).toContain("refresh");
    }
    expect(read).toHaveBeenCalledTimes(1);
  },
);
