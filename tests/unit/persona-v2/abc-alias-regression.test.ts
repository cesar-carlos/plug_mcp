import { expect, it } from "vitest";
import { validateSourceSql } from "../../../src/application/persona-v2/source-sql.js";
import { escopoFromSqlModelo } from "../../../src/application/use-cases/shared/escopo-from-modelo.js";
import { parseSqlModelo } from "../../../src/application/use-cases/shared/sql-modelo.js";
import { assertQueryFieldUses } from "../../../src/application/persona-v2/query-field-uses.js";
const scope = escopoFromSqlModelo(
  parseSqlModelo(
    "SELECT i.product_id, i.amount, p.id, p.name FROM items i JOIN products p ON p.id = i.product_id",
  ),
);
const base =
  "SELECT i.product_id AS product, p.name AS label, SUM(i.amount) AS total FROM items i JOIN products p ON p.id = i.product_id WHERE i.product_id > :minimum GROUP BY i.product_id, p.name";
it.each(["postgres", "mssql", "sybase"] as const)(
  "ABC %s: agregado com JOIN e aliases de saída pode ser paginado",
  (dialect) => {
    const sql = base + " ORDER BY total DESC, product";
    const ast = validateSourceSql(sql, dialect, scope, { page: 2, pageSize: 500 });
    expect(ast.sql).toBe(sql);
    expect(ast.orderByRefs).toEqual([
      { table: null, column: "total" },
      { table: null, column: "product" },
    ]);
  },
);
it.each(["postgres", "mssql", "sybase"] as const)(
  "ABC %s: CTE agregada e classificação externa preservam aliases",
  (dialect) => {
    const sql =
      "WITH ranking AS (" +
      base +
      ") SELECT CASE WHEN r.total > :threshold THEN 1 ELSE 2 END AS class, SUM(r.total) AS class_total FROM ranking r GROUP BY CASE WHEN r.total > :threshold THEN 1 ELSE 2 END ORDER BY class_total DESC";
    expect(() => validateSourceSql(sql, dialect, scope, { page: 1, pageSize: 500 })).not.toThrow();
  },
);
it.each([
  [base + " ORDER BY missing", "COLUNA_AMBIGUA"],
  [base.replace("i.amount", "i.secret") + " ORDER BY total", "COLUNA_FORA_DO_ESCOPO"],
  [
    base.replace("i.product_id AS product", "product_id AS product") + " ORDER BY total",
    "COLUNA_AMBIGUA",
  ],
  [base.replace("WHERE i.product_id", "WHERE total") + " ORDER BY total", "COLUNA_AMBIGUA"],
  [base.replace("GROUP BY i.product_id", "GROUP BY missing") + " ORDER BY total", "COLUNA_AMBIGUA"],
  [base.replace("AS label", "AS total") + " ORDER BY total", "COLUNA_AMBIGUA"],
  [base + " ORDER BY total + 1", "COLUNA_AMBIGUA"],
  [base + " ORDER BY SUM(i.amount)", "INVALID_PLAN"],
])("não amplia autoridade nem libera ordenação incompatível: %s", (sql, code) => {
  expect(() => validateSourceSql(sql, "postgres", scope, { page: 1, pageSize: 500 })).toThrow(
    expect.objectContaining({ code }),
  );
});
it("alias agregado não dispensa finalidade de ordenação na coluna física", () => {
  const ast = validateSourceSql(base + " ORDER BY total DESC", "postgres", scope);
  const fields = [
    { table: "items", name: "product_id", classification: "livre" },
    {
      table: "items",
      name: "amount",
      classification: "pessoal",
      uses: ["projecao", "agrupamento"] as const,
      usePurpose: "Fixture",
    },
    { table: "products", name: "id", classification: "livre" },
    { table: "products", name: "name", classification: "livre" },
  ];
  expect(() => assertQueryFieldUses(ast, fields)).toThrow(
    expect.objectContaining({ code: "AUTHORIZATION_DENIED" }),
  );
  expect(() =>
    assertQueryFieldUses(
      ast,
      fields.map((field) =>
        field.name === "amount"
          ? { ...field, uses: ["projecao", "agrupamento", "ordenacao"] as const }
          : field,
      ),
    ),
  ).not.toThrow();
});
