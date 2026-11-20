import { expect, it } from "vitest";
import { assertSourcePagination } from "../../../src/application/persona-v2/source-sql.js";
import { parseSelect } from "../../../src/application/use-cases/shared/sql-ast.js";

const supplierSql = `WITH candidatos AS (
  SELECT cp.CodFornecedor AS codfornecedor FROM dbo.contapagar AS cp
  WHERE cp.CodEmpresa = 1 AND cp.CodFilial = 3 AND cp.Status IN ('A', 'P') AND cp.SaldoPagar > 0
  GROUP BY cp.CodFornecedor
)
SELECT f.CodFornecedor AS codfornecedor, f.RazaoSocial AS nomefornecedor
FROM candidatos AS x INNER JOIN dbo.fornecedor AS f ON f.CodFornecedor = x.codfornecedor
WHERE f.RazaoSocial LIKE :nomefornecedor
ORDER BY f.CodFornecedor`;

const paginate = (sql: string, page = 1) =>
  assertSourcePagination(parseSelect(sql, "mssql", { allowSchemaQualifiedTables: true }), {
    page,
    pageSize: 30,
  });

it("accepts the FINGER% supplier lookup CTE with its projected qualified sort key", () => {
  for (const page of [1, 2]) expect(() => paginate(supplierSql, page)).not.toThrow();
});

it.each([
  supplierSql.replace("ORDER BY f.CodFornecedor", "ORDER BY x.codfornecedor"),
  supplierSql.replace("f.CodFornecedor AS codfornecedor,", "f.CodFornecedor,"),
  supplierSql.replace("AS nomefornecedor", "AS CODFORNECEDOR"),
  supplierSql.replace("f.RazaoSocial AS nomefornecedor", "f.CodFornecedor AS otherkey"),
])("rejects unavailable or ambiguous CTE output mappings", (sql) => {
  expect(() => paginate(sql)).toThrow(/alias projetado/);
});
