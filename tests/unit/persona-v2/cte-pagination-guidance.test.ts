import { expect, it } from "vitest";
import { parseSelect } from "../../../src/application/use-cases/shared/sql-ast.js";
import { assertSourcePagination } from "../../../src/application/persona-v2/source-sql.js";
import { trainingTopic } from "../../../src/application/persona-v2/training-topics.js";
import type { PERSONA_V2_TRAINING_BASE } from "../../../src/application/persona-v2/training-base.js";

// Synthetic reproduction: no operational SQL, identifiers or parameter values.
const summary = `WITH balances AS (
  SELECT t.Company, t.Branch, t.Currency, t.Supplier,
    SUM(CAST(1 AS bigint)) AS titles, SUM(t.Balance) AS balance
  FROM fixture_titles t WHERE t.Balance > 0
  GROUP BY t.Company, t.Branch, t.Currency, t.Supplier
)
SELECT s.Company AS company, s.Branch AS branch, s.Currency AS currency,
  s.Supplier AS supplier, f.Name AS supplier_name, s.titles, s.balance
FROM balances s LEFT JOIN fixture_suppliers f ON f.Supplier = s.Supplier`;

it("rejects qualified CTE ordering and accepts projected aliases without removing pagination", () => {
  const options = { page: 1, pageSize: 30 };
  const invalid = parseSelect(
    `${summary} ORDER BY s.Company, s.Branch, s.Currency, s.balance DESC, s.Supplier`,
    "mssql",
  );
  expect(() => assertSourcePagination(invalid, options)).toThrow(/alias projetado sem prefixo/);
  try {
    assertSourcePagination(invalid, options);
  } catch (error) {
    expect(error).toMatchObject({ code: "INVALID_PLAN" });
  }
  const valid = parseSelect(
    `${summary} ORDER BY company, branch, currency, balance DESC, supplier`,
    "mssql",
  );
  expect(() => assertSourcePagination(valid, options)).not.toThrow();
  expect(valid.colunas.map((column) => column.alias)).toEqual(
    invalid.colunas.map((column) => column.alias),
  );
  expect(() =>
    assertSourcePagination(parseSelect(`${summary} ORDER BY absent_alias`, "mssql"), options),
  ).toThrow();
  expect(() =>
    assertSourcePagination(parseSelect(`${summary} ORDER BY 1`, "mssql"), options),
  ).toThrow();
});

it("keeps an unpaginated scalar total distinct from a paginated grouped summary", () => {
  const total = parseSelect("SELECT SUM(t.Balance) AS total FROM fixture_titles t", "mssql");
  expect(() => assertSourcePagination(total)).not.toThrow();
  expect(() => assertSourcePagination(total, { page: 1, pageSize: 30 })).toThrow(/ORDER BY/);
});

it.each([undefined, "sql", "plug-server"] as const)(
  "delivers the CTE correction and scalar distinction in guide %s",
  (topic) => {
    const contract = trainingTopic(topic)
      .queryContract as typeof PERSONA_V2_TRAINING_BASE.queryContract;
    expect(contract.pagination.instructions).toContain("CTE: ORDER BY saldo, não s.saldo");
    expect(contract.pagination.instructions).toContain("Total único: sem page/pageSize");
    expect(contract.pagination.firstPage.options).toEqual({ page: 1, pageSize: 30 });
  },
);
