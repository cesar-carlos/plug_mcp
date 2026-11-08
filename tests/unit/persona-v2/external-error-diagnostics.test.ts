import { expect, it, vi } from "vitest";
import pino from "pino";
import {
  externalRpcResult,
  listExternalTools,
} from "../../../src/infrastructure/persona-v2/external-protocol.js";
import { PublicExternalHttp } from "../../../src/infrastructure/persona-v2/external-http.js";
import { reportPersonaV2ToolError } from "../../../src/infrastructure/mcp/persona-v2-tool-error.js";
import { PinoLoggerAdapter } from "../../../src/infrastructure/logging/pino-logger.adapter.js";

it.each(["json", "sse"])("preserva RPC externo seguro em %s sem mensagem privada", (format) => {
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: "fixture",
    error: { code: -32602, message: "private-marker", data: { token: "private-marker" } },
  });
  let failure: unknown;
  try {
    externalRpcResult(
      {
        status: 200,
        headers: { "content-type": format === "json" ? "application/json" : "text/event-stream" },
        body: format === "json" ? body : `data: ${body}\n\n`,
      },
      "fixture",
    );
  } catch (error) {
    failure = error;
  }
  let output = "";
  const response = reportPersonaV2ToolError(
    failure,
    new PinoLoggerAdapter(
      pino(
        {},
        {
          write: (line) => {
            output += line;
          },
        },
      ),
    ),
  );
  expect(response).toMatchObject({
    stage: "external_mcp",
    details: { externalReason: "rpc_error", rpcCode: -32602 },
    retryable: false,
  });
  expect(JSON.parse(output)).toMatchObject({
    supportId: response.supportId,
    details: response.details,
  });
  expect(output + JSON.stringify(response)).not.toContain("private-marker");
});

it.each(["malformed", "duplicate", "conflict", "wrong-id"])(
  "recusa resposta %s sem confundir com erro RPC válido",
  (variant) => {
    const item = {
      jsonrpc: "2.0",
      id: variant === "wrong-id" ? "other" : "fixture",
      result: {},
      ...(variant === "conflict" ? { error: { code: -32602, message: "private-marker" } } : {}),
    };
    const response = {
      status: 200,
      headers: { "content-type": "application/json" },
      body:
        variant === "malformed"
          ? "private-marker"
          : JSON.stringify(variant === "duplicate" ? [item, item] : item),
    };
    expect(() => externalRpcResult(response, "fixture")).toThrow(
      expect.objectContaining({ reason: "invalid_response" }),
    );
  },
);

it("identifica catálogo repetido sem repetir cursor indefinidamente", async () => {
  const send = vi.fn(async () => ({ tools: [], nextCursor: "private-marker" }));
  await expect(listExternalTools(send)).rejects.toMatchObject({ reason: "listing_incomplete" });
  expect(send).toHaveBeenCalledTimes(2);
});

it.each([302, 401, 403, 429, 503])(
  "preserva status HTTP %s sem redirect, reconexão ou retry",
  async (status) => {
    const send = vi.fn(async () => ({
      status,
      headers: { location: "https://private-marker.test" },
      body: "private-marker",
    }));
    const http = new PublicExternalHttp({
      resolve: async () => [{ address: "8.8.8.8", family: 4 }],
      send,
    });
    const error = await http
      .send(
        {
          url: new URL("https://fixture.test"),
          method: "GET",
          headers: {},
          signal: AbortSignal.timeout(1000),
          maxBytes: 1024,
        },
        async () => undefined,
      )
      .catch((failure: unknown) => failure);
    const result = reportPersonaV2ToolError(error);
    expect(result).toMatchObject({
      stage: "external_http",
      details: { externalReason: "http_status", httpStatus: status },
      retryable: false,
    });
    expect(result.hint).toContain("Não reconecte");
    expect(JSON.stringify(result)).not.toContain("private-marker");
    expect(send).toHaveBeenCalledTimes(1);
  },
);
