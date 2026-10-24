import { expect, it } from "vitest";
import { duplicateSqlExamples } from "./training-visual";
it("sugere duplicação por dialeto preservando valores, identificadores citados e parâmetros", () => {
  const examples = [
    { id: "a", dialect: "mssql", sql: "SELECT p.id FROM dbo.orders p WHERE p.name = 'ABC'" },
    { id: "b", dialect: "mssql", sql: "select  p.id\nfrom dbo.orders p where p.name='ABC'" },
    { id: "c", dialect: "postgres", sql: "select p.id from dbo.orders p where p.name='ABC'" },
    { id: "d", dialect: "mssql", sql: "select p.id from dbo.orders p where p.name='abc'" },
    { id: "e", dialect: "mssql", sql: 'select p."Name" from orders p' },
    { id: "f", dialect: "mssql", sql: 'select p."name" from orders p' },
  ];
  expect(duplicateSqlExamples(examples)).toEqual([["a", "b"]]);
  expect(examples[0].sql).toContain("'ABC'");
});
