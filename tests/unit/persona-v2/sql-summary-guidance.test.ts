import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import {
  SQL_SUMMARY_EXAMPLES,
  SQL_SUMMARY_GUIDANCE,
} from "../../../src/application/persona-v2/sql-summary-guidance.js";
import { PERSONA_V2_TRAINING_BASE } from "../../../src/application/persona-v2/training-base.js";
import { PERSONA_V2_INSTRUCTIONS } from "../../../src/application/persona-v2/runtime-instructions.js";
import { PERSONA_CONSUMER_GUIDANCE } from "../../../src/application/persona-v2/consumer-guidance.js";
import { validateSourceSql } from "../../../src/application/persona-v2/source-sql.js";
import { escopoFromSqlModelo } from "../../../src/application/use-cases/shared/escopo-from-modelo.js";
import { parseSqlModelo } from "../../../src/application/use-cases/shared/sql-modelo.js";

const scope = escopoFromSqlModelo(
  parseSqlModelo(
    "SELECT s.branch_id, s.sale_id, s.product_id, s.quantity, s.net_amount, s.sold_at FROM fixture_sales s",
  ),
);

it("base, runtime e guia do pacote entregam a mesma orientação de resumos", () => {
  expect(PERSONA_V2_TRAINING_BASE.sqlSummaries.guidance).toBe(SQL_SUMMARY_GUIDANCE);
  expect(PERSONA_V2_INSTRUCTIONS).toContain(SQL_SUMMARY_GUIDANCE);
  expect(PERSONA_CONSUMER_GUIDANCE).toContain(SQL_SUMMARY_GUIDANCE);
  expect(PERSONA_V2_TRAINING_BASE.sqlSummaries.exampleScope).toContain("Somente fixture sintética");
  for (const required of [
    "GROUP BY",
    "HAVING",
    "SUM(DISTINCT valor)",
    "500",
    "completeness",
    "supportId",
    "não reescreva SQL",
    "não prometer suporte irrestrito",
    "publicados",
  ])
    expect(SQL_SUMMARY_GUIDANCE).toContain(required);
});

it.each(SQL_SUMMARY_EXAMPLES)(
  "exemplo SQL Server é aceito no escopo sintético: $purpose",
  ({ sql, dialect }) => {
    expect(validateSourceSql(sql, dialect, scope).sql).toBe(sql);
    expect(sql).not.toMatch(/\b(TOP|LIMIT|OFFSET)\b/i);
    expect(() =>
      validateSourceSql(sql.replaceAll("s.net_amount", "s.secret"), dialect, scope),
    ).toThrow();
  },
);

it("resumo por produto aceita paginação final e HAVING físico, sem autorizar alias no GROUP BY", () => {
  const sql = SQL_SUMMARY_EXAMPLES[0].sql;
  expect(() => validateSourceSql(sql, "mssql", scope, { page: 2, pageSize: 500 })).not.toThrow();
  expect(() =>
    validateSourceSql(
      sql.replace("ORDER BY", "HAVING SUM(s.net_amount) > :minimum ORDER BY"),
      "mssql",
      scope,
    ),
  ).not.toThrow();
  expect(() =>
    validateSourceSql(sql.replace("GROUP BY s.product_id", "GROUP BY product"), "mssql", scope),
  ).toThrow();
});

it("o exemplo de dia local inclui a primeira meia-noite e exclui a seguinte na coluna UTC", () => {
  const { params } = PERSONA_V2_TRAINING_BASE.queryContract.businessDay.example;
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE fixture_sales(sold_at TEXT, net_amount INTEGER)");
    const insert = db.prepare("INSERT INTO fixture_sales VALUES (?, ?)");
    insert.run("2026-11-01T03:59:59Z", 1);
    insert.run("2026-11-01T04:00:00Z", 2);
    insert.run("2026-11-02T03:59:59Z", 4);
    insert.run("2026-11-02T04:00:00Z", 8);
    expect(db.prepare(SQL_SUMMARY_EXAMPLES[2].sql).get(params)).toEqual({ total_amount: 6 });
  } finally {
    db.close();
  }
});

it("ordena por unidades mesmo quando o maior faturamento e a maior contagem de linhas são de outro produto", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`CREATE TABLE fixture_sales(product_id INTEGER, quantity INTEGER, net_amount INTEGER, sold_at TEXT);
      INSERT INTO fixture_sales VALUES (2,1,200,'2026-11-01'), (2,1,100,'2026-11-01'),
      (1,5,50,'2026-11-01'), (3,5,25,'2026-11-01');`);
    const sql = SQL_SUMMARY_EXAMPLES[5].sql;
    validateSourceSql(sql, "mssql", scope, { page: 1, pageSize: 1 });
    expect(db.prepare(sql).all({ start: "2026-11-01", end: "2026-11-02" })).toEqual([
      { product: 1, units: 5, revenue: 50 },
      { product: 3, units: 5, revenue: 25 },
      { product: 2, units: 2, revenue: 300 },
    ]);
  } finally {
    db.close();
  }
});

it("conta cada venda pela chave completa para o ticket médio consolidado", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`CREATE TABLE fixture_sales(branch_id INTEGER, sale_id INTEGER, net_amount INTEGER NOT NULL, sold_at TEXT);
      INSERT INTO fixture_sales VALUES (1,1,6,'2026-11-01'), (1,1,4,'2026-11-01'),
      (1,2,20,'2026-11-01'), (2,1,90,'2026-11-01'), (2,3,80,'2026-11-02');`);
    const query = db.prepare(SQL_SUMMARY_EXAMPLES[6].sql);
    expect(query.get({ start: "2026-11-01", end: "2026-11-02" })).toEqual({
      revenue: 120,
      sale_count: 3,
    });
    expect(query.get({ start: "2026-11-03", end: "2026-11-04" })).toEqual({
      revenue: null,
      sale_count: 0,
    });
  } finally {
    db.close();
  }
});

it("preserva produtos sem venda no período, inclusive quando só venderam antes, e distingue venda com valor nulo", () => {
  const sql = PERSONA_V2_TRAINING_BASE.queryContract.absence.example.sql;
  const scope = escopoFromSqlModelo(
    parseSqlModelo(
      "SELECT p.product_id, s.sale_id, s.sold_at FROM fixture_products p LEFT JOIN fixture_sales s ON s.product_id = p.product_id",
    ),
  );
  validateSourceSql(sql, "mssql", scope);
  expect(() =>
    validateSourceSql(sql.replace("s.sale_id IS NULL", "s.net_amount IS NULL"), "mssql", scope),
  ).toThrow();
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`CREATE TABLE fixture_products(product_id INTEGER PRIMARY KEY);
      CREATE TABLE fixture_sales(sale_id INTEGER PRIMARY KEY, product_id INTEGER, sold_at TEXT, net_amount INTEGER);
      INSERT INTO fixture_products VALUES (1),(2),(3),(4);
      INSERT INTO fixture_sales VALUES (1,2,'2026-10-31',20),(2,3,'2026-11-01',NULL),(3,4,'2026-11-01',0);`);
    expect(db.prepare(sql).all({ start: "2026-11-01", end: "2026-11-02" })).toEqual([
      { product: 1 },
      { product: 2 },
    ]);
  } finally {
    db.close();
  }
});

it("total e ranking preservam intervalo e grão com empates entre filiais e produtos", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`CREATE TABLE fixture_sales(branch_id INTEGER, product_id INTEGER, net_amount INTEGER, sold_at TEXT);
      INSERT INTO fixture_sales VALUES (2,1,10,'2026-11-01'), (1,2,10,'2026-11-01'),
      (1,1,4,'2026-11-01'), (1,1,6,'2026-11-01'), (1,1,99,'2026-11-02');`);
    const params = { start: "2026-11-01", end: "2026-11-02" };
    const scalar = SQL_SUMMARY_EXAMPLES[2].sql;
    expect(db.prepare(scalar).all(params)).toEqual([{ total_amount: 30 }]);
    const coverage = db.prepare(SQL_SUMMARY_EXAMPLES[4].sql);
    const nextDay = { start: "2026-11-03", end: "2026-11-04" };
    expect(coverage.get(nextDay)).toEqual({ item_count: 0, amount_count: 0, total_amount: null });
    db.exec("INSERT INTO fixture_sales VALUES (1,1,NULL,'2026-11-03')");
    expect(coverage.get(nextDay)).toEqual({ item_count: 1, amount_count: 0, total_amount: null });
    db.exec("INSERT INTO fixture_sales VALUES (1,2,0,'2026-11-03')");
    expect(coverage.get(nextDay)).toEqual({ item_count: 2, amount_count: 1, total_amount: 0 });
    const ranking = SQL_SUMMARY_EXAMPLES[3].sql;
    validateSourceSql(ranking, "mssql", scope, { page: 1, pageSize: 2 });
    expect(db.prepare(ranking).all(params)).toEqual([
      { branch: 1, product: 1, total_amount: 10 },
      { branch: 1, product: 2, total_amount: 10 },
      { branch: 2, product: 1, total_amount: 10 },
    ]);
  } finally {
    db.close();
  }
});
