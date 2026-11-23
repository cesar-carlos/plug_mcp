import { expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { parseSelect } from "../../../src/application/use-cases/shared/sql-ast.js";
import { assertSourcePagination } from "../../../src/application/persona-v2/source-sql.js";
import {
  paginationDiagnostic,
  recordPaginationPublications,
} from "../../../src/domain/errors/pagination-diagnostic.js";
import { PersonaV2Error } from "../../../src/domain/persona-v2/model.js";
import { reportPersonaV2ToolError } from "../../../src/infrastructure/mcp/persona-v2-tool-error.js";

it("logger de produção preserva metadados seguros e ignora contexto forjado", () => {
  const output = execFileSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--input-type=module",
      "-e",
      `
    import {paginationFailure,recordPaginationPublications} from './src/domain/errors/pagination-diagnostic.ts';
    import {PersonaV2Error} from './src/domain/persona-v2/model.ts';
    import {reportPersonaV2ToolError} from './src/infrastructure/mcp/persona-v2-tool-error.ts';
    import {createPino,PinoLoggerAdapter} from './src/infrastructure/logging/pino-logger.adapter.ts';
    const logger=new PinoLoggerAdapter(createPino('warn',false));
    const error=paginationFailure('qualified_order_requires_simple_projection');
    recordPaginationPublications(error,{publicationIds:['11111111-1111-4111-8111-111111111111'],publicationRevisions:[5],queryOrigin:'modelo_publicado'});
    const body=reportPersonaV2ToolError(error,logger);
    const forged=Object.assign(new PersonaV2Error('INVALID_PLAN','secret_sql'),{paginationReason:'secret_reason',publicationIds:['secret_id'],details:{params:'secret_value'}});
    reportPersonaV2ToolError(forged,logger);
    console.log(JSON.stringify({id:body.supportId}));
  `,
    ],
    { encoding: "utf8" },
  );
  expect(output).not.toContain("secret_");
  const lines = output
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line));
  const diagnostic = lines.find((line) => line.paginationReason);
  const correlation = lines.find((line) => line.id);
  const generic = lines.find((line) => line.errorCode && !line.paginationReason);
  expect(correlation?.id).toEqual(expect.any(String));
  expect(diagnostic).toMatchObject({
    errorCode: "INVALID_PLAN",
    paginationReason: "qualified_order_requires_simple_projection",
    publicationRevisions: [5],
    queryOrigin: "modelo_publicado",
    supportId: correlation.id,
  });
  expect(generic).toBeDefined();
  expect(generic).not.toHaveProperty("paginationReason");
  expect(generic).not.toHaveProperty("publicationIds");
});

it.each([
  ["SELECT p.id FROM orders p ORDER BY p.id + 1", "order_not_simple"],
  ["SELECT p.id FROM orders p ORDER BY p.other", "order_not_projected"],
  [
    "SELECT p.id, SUM(p.amount) AS total FROM orders p GROUP BY p.id ORDER BY p.id",
    "qualified_order_requires_simple_projection",
  ],
  ["SELECT p.id AS x, p.amount AS x FROM orders p ORDER BY p.id", "duplicate_projection_alias"],
])("classifica motivo fechado sem expor SQL: %s", (sql, reason) => {
  let failure: unknown;
  try {
    assertSourcePagination(parseSelect(sql, "mssql"), { page: 1, pageSize: 30 });
  } catch (error) {
    failure = error;
  }
  expect(paginationDiagnostic(failure)).toEqual({ paginationReason: reason });
  expect(reportPersonaV2ToolError(failure)).toMatchObject({
    code: "INVALID_PLAN",
    stage: "validar_paginacao",
    details: { paginationReason: reason },
  });
});

it("não aceita diagnóstico injetado em erro genérico nem amplia recusas", () => {
  const forged = Object.assign(new PersonaV2Error("INVALID_PLAN", "fixed"), {
    paginationReason: "secret",
    publicationIds: ["secret"],
  });
  recordPaginationPublications(forged, {
    publicationIds: ["secret"],
    publicationRevisions: [1],
    queryOrigin: "sql_fornecido",
  });
  expect(paginationDiagnostic(forged)).toEqual({});
  expect(reportPersonaV2ToolError(forged)).not.toHaveProperty("details");
  for (const sql of [
    "SELECT p.id FROM orders p ORDER BY p.id",
    "SELECT p.id, SUM(p.amount) AS total FROM orders p GROUP BY p.id ORDER BY id",
  ])
    expect(() =>
      assertSourcePagination(parseSelect(sql, "mssql"), { page: 1, pageSize: 30 }),
    ).not.toThrow();
});
