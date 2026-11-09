import { expect, it } from "vitest";
import { mapPlugServerFailure } from "../../src/infrastructure/plug-server/map-plug-error.js";
import { personaV2ToolError } from "../../src/infrastructure/mcp/persona-v2-tool-error.js";

it.each([
  { code: "AGENT_ACCESS_DENIED", trace: "pending" },
  { code: "AGENT_ACCESS_DENIED", message: "Client account is blocked" },
  { error: { code: "AGENT_ACCESS_DENIED", message: "Client account is not active" } },
  { code: "FORBIDDEN", message: "Owner user is not active" },
  { code: "FORBIDDEN", details: { pending: false, blocked: false } },
])("não transforma outra recusa 403 em Client inativo: %j", (body) => {
  const error = mapPlugServerFailure({ status: 403, body });
  expect(error.code).not.toBe("CLIENT_NOT_ACTIVE");
  expect(personaV2ToolError(error).code).not.toBe("CLIENT_NOT_ACTIVE");
});

it.each([
  { code: "pending", message: "Client is pending" },
  { code: "FORBIDDEN", message: "Client account is blocked" },
  { error: { code: "FORBIDDEN", message: "Client account is not active" } },
])("preserva diagnóstico explícito de Client inativo: %j", (body) => {
  const error = mapPlugServerFailure({ status: 403, body }, undefined, "login");
  expect(error).toMatchObject({
    code: "CLIENT_NOT_ACTIVE",
    source: "plug_server_http",
    stage: "login",
  });
});

it("ignora metadados não serializáveis sem perder o diagnóstico original", () => {
  const body: Record<string, unknown> = { code: "AGENT_ACCESS_DENIED" };
  body.trace = body;
  expect(mapPlugServerFailure({ status: 403, body }).code).toBe("AGENT_ACCESS_DENIED");
});

it("403 sem causa comprovada não afirma inatividade nem falta de acesso ao agente", () => {
  const error = mapPlugServerFailure({ status: 403, body: { message: "private-proxy-denial" } });
  const reply = personaV2ToolError(error);
  expect(reply).toMatchObject({
    code: "PLUG_SERVER_ERROR",
    source: "plug_server_http",
    retryable: false,
    details: { httpStatus: 403 },
  });
  expect(reply.message).toContain("403");
  expect(reply.hint).toContain("não identifica");
  expect(JSON.stringify(reply)).not.toContain("private-");
});
