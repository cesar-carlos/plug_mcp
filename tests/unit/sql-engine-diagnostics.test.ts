import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";
import { mapPlugServerFailure } from "../../src/infrastructure/plug-server/map-plug-error.js";
import { safeErrorDetails } from "../../src/domain/errors/safe-error-details.js";
import { PERSONA_V2_INSTRUCTIONS } from "../../src/application/persona-v2/runtime-instructions.js";

it("orienta a IA sobre limites do diagnóstico e preserva recusa de classificação", () => {
  const error = mapPlugServerFailure({
    status: 200,
    body: {
      error: {
        code: -32002,
        message: "Not authorized",
        data: { technical_message: "SQL classification failed" },
      },
    },
  });
  expect(safeErrorDetails(error.details)).toMatchObject({ sqlReason: "sql_unclassified" });
  expect(error).toMatchObject({ code: "INVALID_SQL", retryable: false });
  expect(PERSONA_V2_INSTRUCTIONS).toContain("details seguros (incluindo sqlReason)");
  expect(PERSONA_V2_INSTRUCTIONS).toContain("sqlReason desconhecido não comprova causa");
  expect(PERSONA_V2_INSTRUCTIONS).toContain(
    "Não invente causas, peça segredos ou repita automaticamente",
  );
});

it.each([
  ['The multi-part identifier "private.column" could not be bound. (4104)', "identifier_binding"],
  ["The ORDER BY clause is invalid in derived tables (1033)", "order_by_context"],
  ["Invalid column name 'private_column'", "identifier_not_found"],
  ["Database driver returned an execution error", "driver_diagnostic_missing"],
  ["private-native-message", "unclassified_engine_error"],
])("preserva categoria segura do motor: %s", (message, sqlReason) => {
  const error = mapPlugServerFailure({ status: 200, body: { error: { code: -32102, message } } });
  expect(safeErrorDetails(error.details)).toMatchObject({ sqlReason, rpcCode: -32102 });
  expect(error).toMatchObject({ code: "INVALID_SQL", source: "sql_engine", retryable: false });
});

it("não aceita categoria arbitrária nem promove falha de protocolo a diagnóstico SQL", () => {
  expect(safeErrorDetails({ sqlReason: "private-secret" })).toEqual({});
  const error = mapPlugServerFailure({
    status: 200,
    body: {
      error: {
        code: -32602,
        message: "The ORDER BY clause is invalid in derived tables (1033)",
        data: { sqlReason: "order_by_context" },
      },
    },
  });
  expect(error.source).not.toBe("sql_engine");
  expect(safeErrorDetails(error.details)).not.toHaveProperty("sqlReason");
});

it("logger real correlaciona causa e supportId sem SQL, identificadores ou segredos", () => {
  const output = execFileSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--input-type=module",
      "-e",
      `
    import { createPino, PinoLoggerAdapter } from './src/infrastructure/logging/pino-logger.adapter.ts';
    import { mapPlugServerFailure } from './src/infrastructure/plug-server/map-plug-error.ts';
    import { reportPersonaV2ToolError } from './src/infrastructure/mcp/persona-v2-tool-error.ts';
    import { SourceExecutionError } from './src/domain/persona-v2/source-execution-error.ts';
    const logger = new PinoLoggerAdapter(createPino('warn', false));
    const error = mapPlugServerFailure({status:200, body:{error:{code:-32102,
      message:'The multi-part identifier "private.column" could not be bound. (4104)',
      data:{technical_message:'private-value password=private-secret SELECT private-sql'}
    }}}, undefined, 'sql.execute');
    const reply = reportPersonaV2ToolError(new SourceExecutionError(error,'sql_fornecido',['fixture-publication']),logger);
    console.log(JSON.stringify({reply}));
  `,
    ],
    { encoding: "utf8" },
  );
  expect(output).not.toContain("private");
  const [event, response] = output
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line));
  expect(event.supportId).toBe(response.reply.supportId);
  expect(event.supportId).toMatch(/^[a-f0-9-]{36}$/);
  expect(event).toMatchObject({
    errorCode: "INVALID_SQL",
    source: "sql_engine",
    stage: "sql.execute",
    queryOrigin: "sql_fornecido",
    publicationIds: ["fixture-publication"],
    details: { sqlReason: "identifier_binding", rpcCode: -32102, httpStatus: 200 },
  });
  expect(response.reply.details.sqlReason).toBe("identifier_binding");
});
