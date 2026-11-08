import { expect, it } from "vitest";
import pino from "pino";
import { DomainError } from "../../../src/domain/errors/domain-error.js";
import { reportPersonaV2ToolError } from "../../../src/infrastructure/mcp/persona-v2-tool-error.js";
import { PinoLoggerAdapter } from "../../../src/infrastructure/logging/pino-logger.adapter.js";
import { PlugServerRestAdapter } from "../../../src/infrastructure/plug-server/plug-server-rest.adapter.js";
import { HubTransportError } from "../../../src/infrastructure/plug-server/hub-http.js";
import { SilentTestLogger } from "../../helpers/silent-logger.js";
import { safeErrorDetails } from "../../../src/domain/errors/safe-error-details.js";

it.each([
  [-32014, "repetição do identificador"],
  [-32104, "pool de conexões"],
  [-32106, "conectar ao banco"],
  [-32108, "configuração de banco"],
  [-32109, "não foi encontrada"],
  [-32110, "cancelamento"],
] as const)("preserva diagnóstico RPC %s e prioriza efeito incerto", async (rpcCode, phrase) => {
  for (const method of ["sql.operation.get", "sql.operation.execute"] as const) {
    let calls = 0;
    const adapter = new PlugServerRestAdapter(
      "https://fixture.test",
      new SilentTestLogger(),
      async () => {
        calls++;
        return Response.json({ error: { code: rpcCode, message: "private-marker" } });
      },
    );
    const reference = { operationId: "fixture", fingerprint: "fixture", database: "fixture" };
    const error = await adapter
      .operationRpc({
        accessToken: "private-marker",
        clientToken: "private-marker",
        agentId: "fixture",
        sourcePhysicalId: "fixture",
        method,
        reference,
        ...(method === "sql.operation.execute"
          ? { command: { ...reference, steps: [], maxAffectedRows: 1, timeoutMs: 1000 } }
          : {}),
      })
      .catch((failure: unknown) => failure);
    const result = reportPersonaV2ToolError(error);
    expect(result.details).toMatchObject({ httpStatus: 200, rpcCode });
    expect(result.message).toContain(
      method === "sql.operation.execute" ? "confirmar o resultado" : phrase,
    );
    expect(result.hint).toContain("rollback");
    expect(result.retryable).toBe(false);
    expect(JSON.stringify(result)).not.toContain("private-marker");
    expect(calls).toBe(1);
  }
});

it.each([400, 503])("preserva HTTP %s sem inferir causa ou copiar corpo remoto", async (status) => {
  let calls = 0;
  const adapter = new PlugServerRestAdapter(
    "https://fixture.test",
    new SilentTestLogger(),
    async () => {
      calls++;
      return Response.json({ message: "private-marker" }, { status });
    },
  );
  const failure = await adapter
    .login("private-marker", "private-marker")
    .catch((error: unknown) => error);
  const result = reportPersonaV2ToolError(failure);
  expect(result.details).toMatchObject({ httpStatus: status });
  expect(result.message).toContain(`HTTP ${status}`);
  expect(result.retryable).toBe(false);
  expect(result.hint).toContain("supportId");
  expect(JSON.stringify(result)).not.toContain("private-marker");
  expect(calls).toBe(1);
});

it("aceita somente status HTTP inteiros conhecidos como diagnóstico", () => {
  for (const httpStatus of [0, 99, 600, 400.5, "503", Infinity, NaN])
    expect(safeErrorDetails({ httpStatus })).toEqual({});
  expect(safeErrorDetails({ httpStatus: 200 })).toEqual({ httpStatus: 200 });
});

it.each(["sql.operation.execute", "sql.operation.get", "sql.operation.cancel"] as const)(
  "preserva RPC seguro após wrapper %s e no log",
  async (method) => {
    let calls = 0,
      output = "";
    const adapter = new PlugServerRestAdapter(
      "https://fixture.test",
      new SilentTestLogger(),
      async () => {
        calls++;
        return Response.json({
          error: {
            code: -32602,
            message: "private-marker",
            data: { reason: "invalid_params", technical_message: "private-marker" },
          },
        });
      },
    );
    const reference = { operationId: "fixture", fingerprint: "fixture", database: "fixture" };
    const failure = await adapter
      .operationRpc({
        accessToken: "private-marker",
        clientToken: "private-marker",
        agentId: "fixture",
        sourcePhysicalId: "fixture",
        method,
        reference,
        ...(method === "sql.operation.execute"
          ? { command: { ...reference, steps: [], maxAffectedRows: 1, timeoutMs: 1000 } }
          : {}),
      })
      .catch((error: unknown) => error);
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
    const result = reportPersonaV2ToolError(failure, logger);
    expect(result.details).toMatchObject({
      httpStatus: 200,
      rpcCode: -32602,
      reason: "invalid_params",
    });
    expect(result.details?.outcome_unknown).toBe(
      method === "sql.operation.execute" ? true : undefined,
    );
    expect(JSON.parse(output)).toMatchObject({
      supportId: result.supportId,
      details: { rpcCode: -32602, reason: "invalid_params" },
    });
    expect(JSON.stringify(result) + output).not.toContain("private-marker");
    expect(calls).toBe(1);
  },
);

it.each(["ECONNRESET", "ENOTFOUND", "CERT_HAS_EXPIRED", "ERR_TLS_CERT_ALTNAME_INVALID"])(
  "preserva código de rede %s sem erro nativo livre",
  async (code) => {
    const native = Object.assign(new Error("private-marker"), { code, address: "private-marker" });
    const transport = new HubTransportError("connection", "network", native);
    expect(transport.errno).toBe(code);
    const adapter = new PlugServerRestAdapter(
      "https://fixture.test",
      new SilentTestLogger(),
      async () => {
        throw transport;
      },
    );
    const failure = await adapter
      .login("private-marker", "private-marker")
      .catch((error: unknown) => error);
    const result = reportPersonaV2ToolError(failure);
    expect(result.details).toMatchObject({ errno: code, transportReason: "network" });
    expect(JSON.stringify(result)).not.toContain("private-marker");
    expect(transport.cause).toBeUndefined();
  },
);

it("allowlist compartilhada preserva SQLSTATE e recusa conteúdo livre ou códigos desconhecidos", () => {
  expect(
    safeErrorDetails({
      sqlstate: "42703",
      rpcCode: -32101,
      engineMessage: "private-marker",
      errno: "PRIVATE_MARKER",
      reason: "private-marker",
    }),
  ).toEqual({ sqlstate: "42703", rpcCode: -32101 });
  expect(
    new HubTransportError("connection", "network", { code: "PRIVATE_MARKER" }).errno,
  ).toBeUndefined();
});

it.each([
  ["capacity", "limite de chamadas"],
  ["timeout", "prazo de comunicação"],
  ["network", "conexão com o hub"],
  ["invalid_response", "resposta inválida"],
])("preserva diagnóstico %s no chat e logger sem mensagem remota", (transportReason, phrase) => {
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
  const result = reportPersonaV2ToolError(
    new DomainError({
      code: "PLUG_SERVER_ERROR",
      source: "plug_server_http",
      stage: "sql.execute.response",
      message: "private-marker",
      hint: "private-marker",
      details: { transportReason, password: "private-marker", sql: "private-marker" },
    }),
    logger,
  );
  expect(result.message.toLowerCase()).toContain(phrase);
  expect(result.hint).toContain("Não peça reconexão");
  expect(result.retryable).toBe(false);
  expect(JSON.parse(output)).toMatchObject({
    supportId: result.supportId,
    details: { transportReason },
  });
  expect(JSON.stringify(result) + output).not.toContain("private-marker");
});

it("preserva resultado desconhecido e fase após wrapper da operação, sem replay", async () => {
  let calls = 0;
  const adapter = new PlugServerRestAdapter(
    "https://fixture.test",
    new SilentTestLogger(),
    async () => {
      calls++;
      throw new HubTransportError("response", "network");
    },
  );
  const failure = await adapter
    .operationRpc({
      accessToken: "private-marker",
      clientToken: "private-marker",
      agentId: "fixture",
      sourcePhysicalId: "fixture",
      method: "sql.operation.execute",
      reference: { operationId: "fixture", fingerprint: "fixture", database: "fixture" },
      command: {
        operationId: "fixture",
        fingerprint: "fixture",
        database: "fixture",
        steps: [],
        maxAffectedRows: 1,
        timeoutMs: 1000,
      },
    })
    .catch((error: unknown) => error);
  const result = reportPersonaV2ToolError(failure);
  expect(result).toMatchObject({
    stage: "sql.operation.execute.response",
    details: { outcome_unknown: true, transportReason: "network" },
    retryable: false,
  });
  expect(result.hint).toContain("Não execute novamente");
  expect(result.hint).toContain("journal");
  expect(calls).toBe(1);
});

it("distingue deriva estrutural da troca de identidade da fonte", () => {
  const result = reportPersonaV2ToolError(
    new DomainError({
      code: "CREDENTIAL_STALE",
      source: "client_token_rpc",
      message: "private-marker",
      hint: "private-marker",
      details: { failureCode: "SOURCE_STRUCTURE_MISMATCH" },
    }),
  );
  expect(result.message).toContain("estrutura");
  expect(result.details).toEqual({ failureCode: "SOURCE_STRUCTURE_MISMATCH" });
});

it("não copia detalhe desconhecido nem inventa causa para exceção interna", () => {
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
  const unknown = reportPersonaV2ToolError(
    new Error("private-marker", { cause: { password: "private-marker" } }),
    logger,
  );
  expect(unknown.hint).toContain("Não foi possível determinar a causa");
  expect(unknown.supportId).toBeTruthy();
  const remote = reportPersonaV2ToolError(
    new DomainError({
      code: "PLUG_SERVER_ERROR",
      message: "private-marker",
      hint: "private-marker",
      details: {
        transportReason: "private-marker",
        outcome_unknown: "true",
        failureCode: "private-marker",
      },
    }),
    logger,
  );
  expect(remote.details).toBeUndefined();
  expect(JSON.stringify([unknown, remote]) + output).not.toContain("private-marker");
});
