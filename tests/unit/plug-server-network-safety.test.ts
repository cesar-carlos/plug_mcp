import { expect, it, vi } from "vitest";
import {
  mapPlugServerFailure,
  mapPlugServerNetworkError,
} from "../../src/infrastructure/plug-server/map-plug-error.js";
import { PlugServerRestAdapter } from "../../src/infrastructure/plug-server/plug-server-rest.adapter.js";
import { reportPersonaV2ToolError } from "../../src/infrastructure/mcp/persona-v2-tool-error.js";
import { SilentTestLogger } from "../helpers/silent-logger.js";

it("não publica texto de exceção nem inventa autorização ou prazo de retry", () => {
  const failure = Object.assign(new Error("private-url?password=private-secret"), {
    code: "PRIVATE_CODE",
    cause: Object.assign(new Error("private-query"), { code: "ECONNRESET" }),
  });
  const result = mapPlugServerNetworkError(failure, "sql.execute");
  expect(result).toMatchObject({
    code: "PLUG_SERVER_ERROR",
    source: "plug_server_http",
    stage: "sql.execute",
    retryable: false,
    details: { transportReason: "network", errno: "ECONNRESET" },
  });
  expect(result.retryAfterMs).toBeNull();
  expect(JSON.stringify(result)).not.toMatch(/private-|PRIVATE_CODE/);
  expect(result.hint).not.toContain("Tente de novo");
});

it("classifica exceção sem converter objeto arbitrário para texto", () => {
  const failure = {
    toString() {
      throw new Error("private-conversion");
    },
  };
  expect(mapPlugServerNetworkError(failure).details).toEqual({ transportReason: "network" });
});

it("recusa payload sem instrução contraditória de repetir", () => {
  const result = mapPlugServerFailure({
    status: 200,
    body: {
      error: { code: -32009, data: { reason: "invalid_payload" } },
    },
  });
  expect(result.retryable).toBe(false);
  expect(result.hint).not.toContain("Tente de novo");
  expect(result.hint).toContain("não repita automaticamente");
});

it("adapter preserva etapa e supportId sem reenviar após exceção de rede não tipada", async () => {
  const http = vi.fn<typeof fetch>(async () => {
    throw Object.assign(new Error("private-payload"), { code: "ECONNRESET" });
  });
  const adapter = new PlugServerRestAdapter("https://fixture.test", new SilentTestLogger(), http);
  const error = await adapter
    .executeSql({
      accessToken: "fixture-token",
      clientToken: "fixture-client",
      agentId: "fixture-agent",
      sql: "SELECT fixture_column FROM fixture_table",
    })
    .catch((e: unknown) => e);
  const result = reportPersonaV2ToolError(error);
  expect(result).toMatchObject({
    code: "PLUG_SERVER_ERROR",
    source: "plug_server_http",
    stage: "sql.execute",
    retryable: false,
    details: { transportReason: "network", errno: "ECONNRESET" },
    supportId: expect.any(String),
  });
  expect(JSON.stringify(result)).not.toContain("private-");
  expect(http).toHaveBeenCalledTimes(1);
});
