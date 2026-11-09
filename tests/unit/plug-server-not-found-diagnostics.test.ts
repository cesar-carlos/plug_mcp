import { expect, it, vi } from "vitest";
import { mapPlugServerFailure } from "../../src/infrastructure/plug-server/map-plug-error.js";
import { PlugServerRestAdapter } from "../../src/infrastructure/plug-server/plug-server-rest.adapter.js";
import { reportPersonaV2ToolError } from "../../src/infrastructure/mcp/persona-v2-tool-error.js";
import { SilentTestLogger } from "../helpers/silent-logger.js";

it.each(["login", "sql.execute"])("404 em %s não comprova histórico do agente", async (stage) => {
  const http = vi.fn<typeof fetch>(async () => new Response("private-proxy-page", { status: 404 }));
  const adapter = new PlugServerRestAdapter("https://fixture.test", new SilentTestLogger(), http);
  const error = await (
    stage === "login"
      ? adapter.login("fixture@example.test", "fixture-password")
      : adapter.executeSql({
          accessToken: "fixture-token",
          clientToken: "fixture-client",
          agentId: "fixture-agent",
          sql: "SELECT fixture FROM fixture_table",
        })
  ).catch((failure: unknown) => failure);
  const reply = reportPersonaV2ToolError(error);
  expect(reply).toMatchObject({
    code: "PLUG_SERVER_ERROR",
    source: "plug_server_http",
    stage,
    retryable: false,
    details: { httpStatus: 404 },
    supportId: expect.any(String),
  });
  expect(reply.message).toContain("404");
  expect(reply.hint).toContain("não comprova");
  expect(JSON.stringify(reply)).not.toMatch(/private-|nunca fez|catálogo vazio/);
  expect(http).toHaveBeenCalledTimes(1);
});

it("404 isolado não afirma agente desconhecido mesmo com mensagem legada", () => {
  const error = mapPlugServerFailure({
    status: 404,
    body: { code: "NOT_FOUND", message: "Agent not found" },
  });
  expect(error.code).toBe("PLUG_SERVER_ERROR");
  expect(error.hint).not.toMatch(/nunca|catálogo vazio/);
});

it("RPC explícito de agente indisponível conserva classificação", () => {
  const error = mapPlugServerFailure({
    status: 404,
    body: { error: { code: -32000, message: "agent_offline" } },
  });
  expect(error.code).toBe("AGENT_UNAVAILABLE");
});
