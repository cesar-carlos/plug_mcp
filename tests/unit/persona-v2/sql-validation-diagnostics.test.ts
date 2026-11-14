import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";
import { parseSelect } from "../../../src/application/use-cases/shared/sql-ast.js";
import { validarAstNoEscopo } from "../../../src/application/use-cases/shared/validar-escopo.js";
import {
  sqlValidationDiagnostic,
  sqlParserFailure,
} from "../../../src/domain/errors/sql-validation-diagnostic.js";
import { DomainError } from "../../../src/domain/errors/domain-error.js";
import { escopoFromSqlModelo } from "../../../src/application/use-cases/shared/escopo-from-modelo.js";
import { parseSqlModelo } from "../../../src/application/use-cases/shared/sql-modelo.js";

it.each([
  ["SELECT x.id FROM", "unexpected_end"],
  ["SELECT x.id FORM secret_table x", "parser_syntax"],
  ["SELECT x.id FROM t x; SELECT y.id FROM t y", "multiple_statements"],
  ["DELETE FROM t", "select_required"],
  ["WITH a AS (SELECT b.id FROM b), b AS (SELECT id FROM t) SELECT id FROM a", "cte_binding"],
  ["WITH a AS (SELECT id FROM t), a AS (SELECT id FROM t) SELECT id FROM a", "cte_binding"],
])("classifica recusa local sem registrar texto: %s", (sql, reason) => {
  let failure: unknown;
  try {
    parseSelect(sql, "mssql");
  } catch (e) {
    failure = e;
  }
  expect(failure).toMatchObject({ code: "INVALID_SQL", source: "sql", stage: "validar_escopo" });
  expect(sqlValidationDiagnostic(failure)).toMatchObject({ sqlValidationReason: reason });
  expect(JSON.stringify(sqlValidationDiagnostic(failure))).not.toContain("secret_table");
});

it("identifica wildcard e não classifica falhas de motor como parser local", () => {
  let failure: unknown;
  try {
    validarAstNoEscopo(
      parseSelect("SELECT * FROM t", "mssql"),
      escopoFromSqlModelo(parseSqlModelo("SELECT t.id FROM t")),
    );
  } catch (e) {
    failure = e;
  }
  expect(sqlValidationDiagnostic(failure)).toMatchObject({
    sqlValidationReason: "wildcard_projection",
  });
  expect(
    sqlValidationDiagnostic(
      new DomainError({
        code: "INVALID_SQL",
        source: "sql_engine",
        message: "secret",
        hint: "secret",
      }),
    ),
  ).toEqual({});
});

it("omita localização inválida e não deduz sintaxe de uma exceção interna", () => {
  const make = () => DomainError.pacote({ code: "INVALID_SQL", message: "safe", hint: "safe" });
  expect(
    sqlValidationDiagnostic(
      sqlParserFailure(
        make(),
        {
          name: "SyntaxError",
          found: null,
          location: { start: { line: "secret", column: 100002 } },
        },
        "mssql",
      ),
    ),
  ).toEqual({ sqlValidationReason: "unexpected_end", dialect: "mssql" });
  expect(
    sqlValidationDiagnostic(sqlParserFailure(make(), new Error("secret_native_sql"), "postgres")),
  ).toEqual({ sqlValidationReason: "parser_failure_unclassified", dialect: "postgres" });
});

it("Pino real conserva supportId e rejeita metadados forjados sem mensagem ou SQL", () => {
  const output = execFileSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--input-type=module",
      "-e",
      `
    import {parseSelect} from './src/application/use-cases/shared/sql-ast.ts';
    import {DomainError} from './src/domain/errors/domain-error.ts';
    import {recordSqlValidationPublications} from './src/domain/errors/sql-validation-diagnostic.ts';
    import {reportPersonaV2ToolError} from './src/infrastructure/mcp/persona-v2-tool-error.ts';
    import {createPino,PinoLoggerAdapter} from './src/infrastructure/logging/pino-logger.adapter.ts';
    const logger=new PinoLoggerAdapter(createPino('warn',false));let error;
    try{parseSelect('SELECT secret_alias FROM secret_table WHERE','mssql')}catch(e){error=e}
    recordSqlValidationPublications(error,{publicationIds:['11111111-1111-4111-8111-111111111111'],publicationRevisions:[34],queryOrigin:'modelo_publicado'});
    const first=reportPersonaV2ToolError(error,logger);
    const forged=DomainError.pacote({code:'INVALID_SQL',message:'secret_message',hint:'secret_hint',details:{sqlValidationReason:'secret_token',publicationIds:['secret_publication'],parserLine:'secret_sql'}});
    const second=reportPersonaV2ToolError(forged,logger);
    console.log(JSON.stringify({ids:[first.supportId,second.supportId]}));
  `,
    ],
    { encoding: "utf8" },
  );
  expect(output).not.toContain("secret_");
  const lines = output
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line));
  const events = lines.filter((line) => line.msg);
  expect(events.map((event) => event.supportId)).toEqual(lines.find((line) => line.ids).ids);
  expect(events[0]).toMatchObject({
    sqlValidationReason: "unexpected_end",
    publicationIds: ["11111111-1111-4111-8111-111111111111"],
    publicationRevisions: [34],
    queryOrigin: "modelo_publicado",
    parserLine: 1,
    parserColumn: expect.any(Number),
  });
  expect(events[1]).toMatchObject({ sqlValidationReason: "unclassified_validation" });
  expect(events[1]).not.toHaveProperty("publicationIds");
  expect(events[1]).not.toHaveProperty("parserLine");
});
