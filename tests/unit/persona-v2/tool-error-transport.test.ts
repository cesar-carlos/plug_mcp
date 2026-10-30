import express from "express";
import request from "supertest";
import { expect, it, vi } from "vitest";
import { createPersonaV2McpHandler } from "../../../src/infrastructure/mcp/persona-v2-http.js";
import { mapPlugServerFailure } from "../../../src/infrastructure/plug-server/map-plug-error.js";
import type { PersonaConsumerCatalog } from "../../../src/application/persona-v2/consumer-catalog.js";
import type { PersonaOAuth } from "../../../src/application/persona-v2/oauth.js";
import type { LoggerPort } from "../../../src/domain/ports/logger.port.js";
import { parseMcpPayload, toolJson } from "../../helpers/mcp-rpc.js";

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
