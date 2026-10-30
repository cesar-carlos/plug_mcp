import { expect, it, vi } from "vitest";
import { correlatePersonaProtocolResponse } from "../../../src/infrastructure/mcp/persona-v2-protocol-error.js";
import type { LoggerPort } from "../../../src/domain/ports/logger.port.js";

it.each(["application/json", "text/event-stream"])(
  "preserva sucesso e erro já correlacionado em %s",
  async (type) => {
    const warn = vi.fn();
    for (const result of [
      { content: [{ type: "text", text: "resposta sintética ç" }] },
      {
        isError: true,
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: { code: "INVALID_PLAN", supportId: "existing-id" } }),
          },
        ],
      },
    ]) {
      const payload = JSON.stringify({ jsonrpc: "2.0", id: 1, result });
      const source = type === "application/json" ? payload : `event: message\ndata: ${payload}\n\n`;
      const bytes = new TextEncoder().encode(source);
      const stream = new ReadableStream({
        start(controller) {
          for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
          controller.close();
        },
      });
      const response = await correlatePersonaProtocolResponse(
        new Response(stream, { headers: { "content-type": type } }),
        { warn } as unknown as LoggerPort,
      );
      expect(await response.text()).toBe(source);
    }
    expect(warn).not.toHaveBeenCalled();
  },
);

it("preserva código RPC e id, substitui dados livres e correlaciona JSON", async () => {
  const warn = vi.fn();
  const response = await correlatePersonaProtocolResponse(
    new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 7,
        error: { code: -32602, message: "sensitive-message", data: { sql: "sensitive-sql" } },
      }),
      { status: 400, headers: { "content-type": "application/json" } },
    ),
    { warn } as unknown as LoggerPort,
  );
  const text = await response.text();
  expect(text).not.toContain("sensitive-");
  expect(response.status).toBe(400);
  const payload = JSON.parse(text) as { error: { data: { supportId: string } } };
  expect(payload).toMatchObject({
    id: 7,
    error: { code: -32602, data: { code: "MCP_PROTOCOL_ERROR" } },
  });
  expect(warn).toHaveBeenCalledExactlyOnceWith(
    "persona-v2 request failed",
    expect.objectContaining({ supportId: payload.error.data.supportId, rpcCode: -32602 }),
  );
});
