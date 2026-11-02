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
  parseSqlModelo("SELECT s.branch_id, s.product_id, s.net_amount, s.sold_at FROM fixture_sales s"),
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

it("total e ranking preservam intervalo e grão com empates entre filiais e produtos", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`CREATE TABLE fixture_sales(branch_id INTEGER, product_id INTEGER, net_amount INTEGER, sold_at TEXT);
      INSERT INTO fixture_sales VALUES (2,1,10,'2026-11-01'), (1,2,10,'2026-11-01'),
      (1,1,4,'2026-11-01'), (1,1,6,'2026-11-01'), (1,1,99,'2026-11-02');`);
    const params = { start: "2026-11-01", end: "2026-11-02" };
    const scalar = SQL_SUMMARY_EXAMPLES[2].sql;
    expect(db.prepare(scalar).all(params)).toEqual([{ total_amount: 30 }]);
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
