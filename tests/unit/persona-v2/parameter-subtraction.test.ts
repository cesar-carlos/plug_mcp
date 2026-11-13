import { expect, it } from "vitest";
import { parseSelect } from "../../../src/application/use-cases/shared/sql-ast.js";
import { validateSourceSql } from "../../../src/application/persona-v2/source-sql.js";
import { extractNamedParams } from "../../../src/application/use-cases/shared/sql-scan.js";
import { delimitParserSubtraction } from "../../../src/application/use-cases/shared/sql-parser-subtraction.js";
import { escopoFromSqlModelo } from "../../../src/application/use-cases/shared/escopo-from-modelo.js";
import { parseSqlModelo } from "../../../src/application/use-cases/shared/sql-modelo.js";

it.each(["+", "-", "*", "/", "%", "=", ">=", "<=", "<>"])(
  "preserves compact operator %s next to named parameters",
  (operator) => {
    const compact = `SELECT m.saldo${operator}:valor AS q FROM medidas m`;
    const spaced = `SELECT m.saldo ${operator} :valor AS q FROM medidas m`;
    for (const dialect of ["mssql", "sybase", "postgres"] as const) {
      const ast = parseSelect(compact, dialect);
      expect(ast.colunas).toEqual(parseSelect(spaced, dialect).colunas);
      expect(ast.sql).toBe(compact);
      expect(extractNamedParams(compact)).toEqual(["valor"]);
    }
  },
);

it.each(["mssql", "sybase"] as const)(
  "preserves subtraction and physical lineage beside named parameters in %s",
  (dialect) => {
    const sql =
      "SELECT m.demandadiaria*:diashorizonte-m.saldoatual-m.quantidadepedidocompra AS q FROM medidas m";
    const ast = parseSelect(sql, dialect);
    const spaced = parseSelect(sql.replaceAll("-", " - "), dialect);
    expect(ast.sql).toBe(sql);
    expect(ast.usageRefs).toEqual(spaced.usageRefs);
    expect(ast.usageRefs?.projecao).toEqual(
      expect.arrayContaining([
        { table: "m", column: "demandadiaria" },
        { table: "m", column: "saldoatual" },
        { table: "m", column: "quantidadepedidocompra" },
      ]),
    );
    expect(extractNamedParams(sql)).toEqual(["diashorizonte"]);
  },
);

it("does not hide an unauthorized column after a parameter subtraction", () => {
  const scope = escopoFromSqlModelo(parseSqlModelo("SELECT m.saldo FROM medidas m", "mssql"));
  expect(() =>
    validateSourceSql("SELECT :dias-m.restrita AS q FROM medidas m", "mssql", scope),
  ).toThrow(expect.objectContaining({ code: "COLUNA_FORA_DO_ESCOPO" }));
});

it("validates a compact CTE aggregate without changing SQL or bypassing scope", () => {
  const scope = escopoFromSqlModelo(
    parseSqlModelo("SELECT m.demanda, m.saldo, m.pedido FROM medidas m", "mssql"),
  );
  const sql =
    "WITH calculo AS (SELECT m.demanda*:dias-m.saldo-m.pedido AS falta FROM medidas m) SELECT SUM(c.falta) AS total FROM calculo c";
  expect(validateSourceSql(sql, "mssql", scope).sql).toBe(sql);
  expect(() =>
    validateSourceSql(sql.replace("m.pedido AS", "m.restrita AS"), "mssql", scope),
  ).toThrow(expect.objectContaining({ code: "COLUNA_FORA_DO_ESCOPO" }));
});

it("does not absorb numeric subtraction into the name or alter quoted content and comments", () => {
  const ast = parseSelect("SELECT :dias-1 AS q", "mssql");
  expect(ast.colunas).toEqual(parseSelect("SELECT :dias - 1 AS q", "mssql").colunas);
  for (const text of [
    "':dias-1'",
    "'it''s :dias-1'",
    '"x:di-as"',
    "[x]]:dias-1]",
    "`:dias-1`",
    "/* :dias-1 */",
    "-- :dias-1\n",
  ]) {
    expect(delimitParserSubtraction(text)).toBe(text);
  }
  expect(delimitParserSubtraction("SELECT :dias-- :hidden-1\n AS q")).toBe(
    "SELECT :dias-- :hidden-1\n AS q",
  );
  expect(delimitParserSubtraction("SELECT 1e-3, 2.5E-4, .2e-1, -1, :n-1")).toBe(
    "SELECT 1e-3, 2.5E-4, .2e-1,  - 1, :n - 1",
  );
});

it.each([
  "SELECT :dias-1 AS q; DELETE FROM medidas",
  "SELECT :dias-m.restrita AS q INTO copia FROM medidas m",
])("keeps read-only guards for %s", (sql) => {
  expect(() => parseSelect(sql, "mssql")).toThrow();
});
