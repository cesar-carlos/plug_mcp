import express from "express";
import request from "supertest";
import { expect, it, vi } from "vitest";
import { createPersonaV2McpHandler } from "../../../src/infrastructure/mcp/persona-v2-http.js";
import { mapPlugServerFailure } from "../../../src/infrastructure/plug-server/map-plug-error.js";
import type { PersonaConsumerCatalog } from "../../../src/application/persona-v2/consumer-catalog.js";
import type { PersonaOAuth } from "../../../src/application/persona-v2/oauth.js";
import type { LoggerPort } from "../../../src/domain/ports/logger.port.js";
import { parseMcpPayload, toolJson } from "../../helpers/mcp-rpc.js";
import { PersonaV2Error } from "../../../src/domain/persona-v2/model.js";

it.each([
  ["AUTHORIZATION_DENIED", "valid", false],
  ["STALE_AUTHORIZATION", "valid", false],
  ["AUTHORIZATION_DENIED", "expired", true],
  ["AUTHORIZATION_DENIED", "stale", true],
  ["AUTHORIZATION_DENIED", "unavailable", false],
  ["INVALID_PLAN", "valid", false],
] as const)("reconexão depende da autenticação: %s / %s", async (code, state, reconnect) => {
  const identity = { personaId: "fixture", tokenId: "fixture", tokenVersion: 1, personaVersion: 1 };
  const resolve = vi.fn().mockResolvedValue(identity);
  if (state !== "valid") {
    resolve
      .mockResolvedValueOnce(identity)
      .mockRejectedValue(
        state === "unavailable"
          ? new Error("sensitive-database")
          : new PersonaV2Error(
              state === "stale" ? "STALE_AUTHORIZATION" : "AUTHORIZATION_DENIED",
              "Conexão indisponível.",
            ),
      );
  }
  const persona = vi.fn().mockRejectedValue(new PersonaV2Error(code, "Operação recusada."));
  const warn = vi.fn();
  const app = express();
  app.use(express.json());
  app.post(
    "/mcp",
    createPersonaV2McpHandler(
      { persona } as unknown as PersonaConsumerCatalog,
      "http://fixture.test",
      undefined,
      undefined,
      undefined,
      { resolve } as unknown as PersonaOAuth,
      undefined,
      undefined,
      undefined,
      { warn } as unknown as LoggerPort,
    ),
  );
  const response = await request(app)
    .post("/mcp")
    .set("Host", "fixture.test")
    .set("Authorization", "Bearer fixture")
    .set("Accept", "application/json, text/event-stream")
    .send({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "obter_contexto_persona", arguments: {} },
    });
  const payload = parseMcpPayload(response);
  expect(payload.result).toMatchObject({ isError: true });
  const result = payload.result as { _meta?: Record<string, unknown> };
  expect(Boolean(result._meta?.["mcp/www_authenticate"])).toBe(reconnect);
  const { error } = toolJson(payload) as { error: { code: string; supportId: string } };
  expect(error.code).toBe(code);
  if (code !== "INVALID_PLAN") {
    expect(error).toMatchObject({
      details: {
        authorizationReason:
          state === "valid"
            ? "permission_denied"
            : state === "unavailable"
              ? "authentication_unavailable"
              : "identity_invalid",
      },
      retryable: false,
    });
  }
  expect(warn).toHaveBeenCalledWith(
    "persona-v2 tool failed",
    expect.objectContaining({ supportId: error.supportId, errorCode: code }),
  );
  expect(persona).toHaveBeenCalledTimes(1);
  expect(resolve).toHaveBeenCalledTimes(code === "INVALID_PLAN" ? 1 : 2);
  expect(JSON.stringify(payload)).not.toContain("sensitive-database");
});

it.each([false, true])(
  "correlaciona erro RPC e log pelo transporte MCP (OAuth=%s)",
  async (oauth) => {
    const failure = mapPlugServerFailure({
      status: 200,
      body: {
        error: {
          code: -32602,
          message: "secret",
          data: { reason: "invalid_params", technical_message: "SELECT password=secret" },
        },
      },
    });
    const resolve = async () => ({
      personaId: "fixture",
      tokenId: "fixture",
      tokenVersion: 1,
      personaVersion: 1,
    });
    const consumer = {
      authenticate: resolve,
      persona: async () => {
        throw failure;
      },
    } as unknown as PersonaConsumerCatalog;
    const warn = vi.fn();
    const app = express();
    app.use(express.json());
    app.post(
      "/mcp",
      createPersonaV2McpHandler(
        consumer,
        "http://fixture.test",
        undefined,
        undefined,
        undefined,
        oauth ? ({ resolve } as unknown as PersonaOAuth) : undefined,
        undefined,
        undefined,
        undefined,
        { warn } as unknown as LoggerPort,
      ),
    );
    const response = await request(app)
      .post("/mcp")
      .set("Host", "fixture.test")
      .set("Authorization", "Bearer fixture")
      .set("X-Request-ID", "caller-controlled")
      .set("Accept", "application/json, text/event-stream")
      .send({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "obter_contexto_persona", arguments: {} },
      });
    const payload = parseMcpPayload(response);
    expect(payload.result).toMatchObject({ isError: true });
    const { error } = toolJson(payload) as { error: { supportId: string } };
    expect(error).toMatchObject({
      code: "PLUG_SERVER_ERROR",
      message: "O hub recusou o JSON-RPC: parâmetros inválidos.",
      retryable: false,
      details: { rpcCode: -32602, reason: "invalid_params" },
    });
    expect(error.supportId).toMatch(/^[0-9a-f-]{36}$/);
    expect(warn).toHaveBeenCalledWith(
      "persona-v2 tool failed",
      expect.objectContaining({
        supportId: error.supportId,
        errorCode: "PLUG_SERVER_ERROR",
        details: { rpcCode: -32602, reason: "invalid_params" },
      }),
    );
    expect(JSON.stringify([payload, warn.mock.calls])).not.toMatch(
      /secret|SELECT|caller-controlled/,
    );
  },
);
