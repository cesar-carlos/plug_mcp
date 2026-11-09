import { expect, it, vi } from "vitest";
import { PlugServerRestAdapter } from "../../src/infrastructure/plug-server/plug-server-rest.adapter.js";
import { reportPersonaV2ToolError } from "../../src/infrastructure/mcp/persona-v2-tool-error.js";
import { HubTransportError } from "../../src/infrastructure/plug-server/hub-http.js";
import { interactionErrorReportSchema } from "../../src/domain/persona-v2/interaction-error-report.js";
import { SilentTestLogger } from "../helpers/silent-logger.js";

const rpcCases = [
  [-32700, "PLUG_SERVER_ERROR"],
  [-32600, "PLUG_SERVER_ERROR"],
  [-32601, "PLUG_SERVER_ERROR"],
  [-32602, "PLUG_SERVER_ERROR"],
  [-32603, "PLUG_SERVER_ERROR"],
  [-32000, "AGENT_UNAVAILABLE"],
  [-32001, "MISSING_CLIENT_TOKEN"],
  [-32002, "ACCESS_REVOKED"],
  [-32008, "QUERY_TIMEOUT"],
  [-32009, "PLUG_SERVER_ERROR"],
  [-32010, "PLUG_SERVER_ERROR"],
  [-32011, "PLUG_SERVER_ERROR"],
  [-32012, "PLUG_SERVER_ERROR"],
  [-32013, "RATE_LIMITED"],
  [-32014, "PLUG_SERVER_ERROR"],
  [-32101, "INVALID_SQL"],
  [-32102, "INVALID_SQL"],
  [-32103, "INVALID_SQL"],
  [-32104, "AGENT_UNAVAILABLE"],
  [-32105, "CONSULTA_ORCAMENTO"],
  [-32106, "AGENT_UNAVAILABLE"],
  [-32107, "QUERY_TIMEOUT"],
  [-32108, "PLUG_SERVER_ERROR"],
  [-32109, "PLUG_SERVER_ERROR"],
  [-32110, "PLUG_SERVER_ERROR"],
] as const;

it.each([
  [400, "PLUG_SERVER_ERROR"],
  [401, "USER_AUTH_EXPIRED"],
  [403, "PLUG_SERVER_ERROR"],
  [404, "PLUG_SERVER_ERROR"],
  [405, "PLUG_SERVER_ERROR"],
  [408, "PLUG_SERVER_ERROR"],
  [429, "RATE_LIMITED"],
  [500, "PLUG_SERVER_ERROR"],
  [502, "PLUG_SERVER_ERROR"],
  [503, "AGENT_UNAVAILABLE"],
  [504, "PLUG_SERVER_ERROR"],
] as const)("HTTP %s preserva diagnóstico público %s sem replay", async (status, code) => {
  const http = vi.fn<typeof fetch>(async () => new Response("private-proxy", { status }));
  const adapter = new PlugServerRestAdapter("https://fixture.test", new SilentTestLogger(), http);
  const reply = reportPersonaV2ToolError(
    await adapter.login("fixture", "fixture").catch((e: unknown) => e),
  );
  expect(reply).toMatchObject({
    code,
    stage: "login",
    retryable: false,
    details: { httpStatus: status },
    supportId: expect.any(String),
  });
  expect(JSON.stringify(reply)).not.toContain("private-proxy");
  expect(http).toHaveBeenCalledTimes(1);
});

it.each(rpcCases)(
  "RPC %s atravessa adapter e resposta MCP sem texto privado ou replay",
  async (code, expected) => {
    const http = vi.fn<typeof fetch>(async () =>
      Response.json({
        error: {
          code,
          message: "private-marker",
          data: {
            technical_message: "private-marker",
            reason:
              code === -32009
                ? "invalid_payload"
                : code === -32001
                  ? "missing_client_token"
                  : "private-marker",
          },
        },
      }),
    );
    const adapter = new PlugServerRestAdapter("https://fixture.test", new SilentTestLogger(), http);
    const error = await adapter
      .executeSql({
        accessToken: "fixture",
        clientToken: "fixture",
        agentId: "fixture",
        sql: "SELECT fixture FROM fixture_table",
      })
      .catch((e: unknown) => e);
    const reply = reportPersonaV2ToolError(error);
    expect(reply).toMatchObject({
      code: expected,
      stage: "sql.execute",
      retryable: false,
      supportId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      details: { httpStatus: 200, rpcCode: code },
    });
    expect(JSON.stringify(reply)).not.toContain("private-marker");
    expect(http).toHaveBeenCalledTimes(1);
  },
);

it.each(["login", "refresh", "getClientProfile", "getAgentAccessStatus"] as const)(
  "etapa %s permanece identificável no erro HTTP, transporte e relato",
  async (stage) => {
    for (const mode of ["http", "response", "invalid"] as const) {
      const http = vi.fn<typeof fetch>(async () => {
        if (mode === "response") throw new HubTransportError("response", "timeout");
        return Response.json({}, { status: mode === "http" ? 503 : 200 });
      });
      const adapter = new PlugServerRestAdapter(
        "https://fixture.test",
        new SilentTestLogger(),
        http,
      );
      const call =
        stage === "login"
          ? adapter.login("fixture", "fixture")
          : stage === "refresh"
            ? adapter.refresh("fixture")
            : stage === "getClientProfile"
              ? adapter.getClientProfile("fixture")
              : adapter.getAgentAccessStatus("fixture", "fixture");
      const reply = reportPersonaV2ToolError(await call.catch((e: unknown) => e));
      expect(reply.stage).toBe(mode === "response" ? `${stage}.response` : stage);
      expect(reply.retryable).toBe(false);
      expect(
        interactionErrorReportSchema.safeParse({
          question: "Falha sintética",
          category: "transporte",
          error: {
            code: reply.code,
            message: reply.message,
            supportId: reply.supportId,
            stage: reply.stage,
          },
          execution: { summary: "Sem repetição", steps: [] },
        }).success,
      ).toBe(true);
      expect(http).toHaveBeenCalledTimes(1);
    }
  },
);
