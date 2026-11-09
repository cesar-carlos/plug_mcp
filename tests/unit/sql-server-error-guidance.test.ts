import { expect, it } from "vitest";
import { mapPlugServerFailure } from "../../src/infrastructure/plug-server/map-plug-error.js";
import { PRE_TREINO_SESSAO } from "../../src/infrastructure/mcp/server-instructions.js";

it.each([
  { status: 200, code: -32602, reason: "invalid_params", expected: "PLUG_SERVER_ERROR" },
  { status: 200, code: -32009, reason: "invalid_payload", expected: "PLUG_SERVER_ERROR" },
  { status: 503, code: undefined, reason: undefined, expected: "AGENT_UNAVAILABLE" },
])("4104 não substitui recusa explícita $status/$code", ({ status, code, reason, expected }) => {
  const result = mapPlugServerFailure({
    status,
    body: {
      error: {
        code,
        message: 'The multi-part identifier "private.column" could not be bound. (4104)',
        data: { reason },
      },
    },
  });
  expect(result.code).toBe(expected);
  expect(result.source).not.toBe("sql_engine");
  expect(result.hint).not.toContain("revise aliases");
});

it.each([-32101, -32102, -32009, undefined])(
  "4104 com RPC %s não presume paginação nem orienta executar novamente",
  (code) => {
    const result = mapPlugServerFailure(
      {
        status: 200,
        body: {
          error: {
            code,
            message:
              '[SQL Server] The multi-part identifier "private.column" could not be bound. (4104)',
          },
        },
      },
      undefined,
      "sql.execute",
    );
    expect(result).toMatchObject({
      code: "INVALID_SQL",
      source: "sql_engine",
      stage: "sql.execute",
      retryable: false,
      nextAction: "validar_consulta",
    });
    expect(result.hint).toMatch(/aliases|escopo/);
    expect(result.hint).not.toMatch(/use TOP|Não repita options.page|Motor:|private/);
    expect(result.message).not.toMatch(/paginação|private/);
  },
);

it("1033 pede revisão do ORDER BY sem afirmar que o agente criou o problema", () => {
  const result = mapPlugServerFailure({
    status: 200,
    body: {
      error: {
        code: -32102,
        message: "The ORDER BY clause is invalid in derived tables (1033)",
      },
    },
  });
  expect(result.nextAction).toBe("validar_consulta");
  expect(result.hint).not.toMatch(/colocou|já passa|TOP n/);
  expect(result.hint).toContain("não comprova");
  expect(result.hint).toContain("ORDER BY");
});

it("treinamento legado não prescreve TOP como recuperação automática de 4104", () => {
  expect(PRE_TREINO_SESSAO).not.toContain("1033 ou 4104, use TOP");
  expect(PRE_TREINO_SESSAO).toContain("4104 exige revisar aliases");
});
