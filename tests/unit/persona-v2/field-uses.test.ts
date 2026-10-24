import { describe, expect, it } from "vitest";
import { compileQueryTraining } from "../../../src/application/persona-v2/query-training.js";
import { assertQueryFieldUses } from "../../../src/application/persona-v2/query-field-uses.js";
import { validateSourceSql } from "../../../src/application/persona-v2/source-sql.js";
import { NodeCryptoAdapter } from "../../../src/infrastructure/crypto/node-crypto.adapter.js";
import { queryTraining, trainingSource } from "../../helpers/persona-v2-training.js";
import type { FieldUse } from "../../../src/domain/persona-v2/field-use.js";
import { federationFieldUses } from "../../../src/application/persona-v2/federation-field-uses.js";
import { parseSelect } from "../../../src/application/use-cases/shared/sql-ast.js";

const crypto = new NodeCryptoAdapter("a".repeat(64));
const training = (uses: FieldUse[] = ["filtro"]) => ({
  ...queryTraining(),
  sqlModel: "SELECT p.id FROM orders p WHERE p.amount > :minimum ORDER BY p.id",
  columns: queryTraining().columns.map((c) =>
    c.name === "amount"
      ? {
          ...c,
          classification: "pessoal",
          uses,
          usePurpose: "Analisar pedidos sintéticos autorizados",
        }
      : c,
  ),
});
describe("finalidades de campos em consultas publicadas", () => {
  it("finalidade adicional de saída verifica todos os ramos por posição, mesmo com aliases diferentes", () => {
    const raw = training(["projecao", "filtro"]),
      pkg = compileQueryTraining(raw, trainingSource, crypto);
    const sql =
      "SELECT p.id AS item FROM orders p WHERE p.id > :minimum UNION ALL SELECT p.amount AS other FROM orders p WHERE p.id > :minimum";
    const ast = validateSourceSql(sql, "postgres", pkg.scope);
    // This is also the contract used for cross-source keys/order, independent of export.
    expect(() => assertQueryFieldUses(ast, raw.columns, { item: ["join"] })).toThrow();
    const permitted = raw.columns.map((c) =>
      c.name === "amount" ? { ...c, uses: ["projecao", "filtro", "join"] as FieldUse[] } : c,
    );
    expect(() => assertQueryFieldUses(ast, permitted, { item: ["join"] })).not.toThrow();
  });
  it("exige concessão explícita e justificativa para pessoal/sensível; segredo/inferido não executam", () => {
    const raw = training();
    const pkg = compileQueryTraining(raw, trainingSource, crypto);
    expect(pkg.requiredCapabilities).toContain(
      `field-use:${trainingSource.id}:orders.amount:filtro`,
    );
    for (const classification of ["pessoal", "sensivel", "segredo", "inferido"]) {
      expect(() =>
        compileQueryTraining(
          {
            ...raw,
            columns: raw.columns.map((c) =>
              c.name === "amount" ? { ...c, classification, usePurpose: undefined } : c,
            ),
          },
          trainingSource,
          crypto,
        ),
      ).toThrow();
    }
    expect(() =>
      compileQueryTraining(
        {
          ...raw,
          columns: queryTraining().columns.map((c) => ({ ...c, classification: "pessoal" })),
        },
        trainingSource,
        crypto,
      ),
    ).toThrow();
  });
  it.each(["postgres", "mssql", "sybase"] as const)(
    "valida todos os usos no dialeto %s sem SQL de negócio",
    (dialect) => {
      const raw = { ...training(), dialect };
      const pkg = compileQueryTraining(raw, { ...trainingSource, dialect }, crypto);
      for (const sql of [
        "SELECT p.id, p.amount FROM orders p WHERE p.id > :minimum",
        "SELECT p.id FROM orders p WHERE p.id > :minimum ORDER BY p.amount",
        "SELECT p.amount AS value FROM orders p WHERE p.id > :minimum ORDER BY 1",
        "SELECT p.id FROM orders p WHERE p.id > :minimum GROUP BY p.id, p.amount",
        "SELECT p.id FROM orders p INNER JOIN orders q ON q.id = p.amount WHERE p.id > :minimum",
        "SELECT p.id FROM orders p WHERE p.id > :minimum UNION ALL SELECT q.amount AS id FROM orders q WHERE q.id > :minimum",
      ]) {
        // Structural scope or purpose must refuse; neither path dispatches SQL.
        expect(
          () => assertQueryFieldUses(validateSourceSql(sql, dialect, pkg.scope), raw.columns),
          sql,
        ).toThrow();
      }
    },
  );
  it("resolve aliases derivados e CTE sem permitir novo uso", () => {
    const raw = training(["projecao", "filtro"]);
    const pkg = compileQueryTraining(raw, trainingSource, crypto);
    for (const sql of [
      "SELECT x.id FROM (SELECT p.id, p.amount AS value FROM orders p WHERE p.id > :minimum) x WHERE x.id > :minimum ORDER BY x.value",
      "WITH x AS (SELECT p.id, p.amount AS value FROM orders p WHERE p.id > :minimum) SELECT x.id FROM x WHERE x.id > :minimum ORDER BY x.value",
      "SELECT p.amount AS value FROM orders p WHERE p.id > :minimum ORDER BY 1",
      "SELECT ROW_NUMBER() OVER (ORDER BY p.amount) AS rank FROM orders p WHERE p.id > :minimum",
      "SELECT SUM(p.amount) AS total FROM orders p WHERE p.id > :minimum",
    ])
      expect(
        () => assertQueryFieldUses(validateSourceSql(sql, "postgres", pkg.scope), raw.columns),
        sql,
      ).toThrow();
  });
  it("permite os usos publicados e recusa finalidade adicional de combinação/exportação", () => {
    const raw = training(["projecao", "filtro", "agrupamento", "ordenacao"]);
    const pkg = compileQueryTraining(raw, trainingSource, crypto);
    for (const sql of [
      raw.sqlModel,
      "SELECT p.amount AS value FROM orders p WHERE p.id > :minimum ORDER BY p.amount",
      "SELECT p.amount AS value FROM orders p WHERE p.id > :minimum ORDER BY 1",
      "SELECT SUM(p.amount) AS total FROM orders p WHERE p.id > :minimum",
    ])
      expect(
        () => assertQueryFieldUses(validateSourceSql(sql, "postgres", pkg.scope), raw.columns),
        sql,
      ).not.toThrow();
    const ast = validateSourceSql(
      "SELECT p.amount AS value FROM orders p WHERE p.id > :minimum",
      "postgres",
      pkg.scope,
    );
    expect(() => assertQueryFieldUses(ast, raw.columns, { value: ["join"] })).toThrow();
    expect(() => assertQueryFieldUses(ast, raw.columns, { value: ["exportacao"] })).toThrow();
  });
  it("mudança de classificação/finalidades altera o contrato exigido; publicações livres antigas mantêm capacidades", () => {
    const first = compileQueryTraining(training(), trainingSource, crypto);
    const second = compileQueryTraining(training(["filtro", "projecao"]), trainingSource, crypto);
    expect(first.requiredCapabilities.at(-1)).not.toBe(second.requiredCapabilities.at(-1));
    expect(
      compileQueryTraining(queryTraining(), trainingSource, crypto).requiredCapabilities,
    ).toHaveLength(3);
  });
  it("aliases, DISTINCT, CASE e subconsultas sem finalidade comprovável não contornam restrição", () => {
    const raw = training(["projecao"]);
    for (const sql of [
      "SELECT p.amount AS value FROM orders p ORDER BY value",
      "SELECT DISTINCT p.amount AS value FROM orders p",
      "SELECT CASE WHEN p.amount > 0 THEN p.id ELSE 0 END AS value FROM orders p",
      "SELECT p.id FROM orders p ORDER BY (SELECT q.amount FROM orders q WHERE q.id = p.id)",
      "SELECT p.id FROM orders p WHERE EXISTS (SELECT q.amount FROM orders q WHERE q.id = p.id)",
    ])
      expect(() => assertQueryFieldUses(parseSelect(sql, "postgres"), raw.columns), sql).toThrow();
    expect(() =>
      assertQueryFieldUses(
        parseSelect("SELECT p.amount AS value FROM orders p ORDER BY value", "postgres"),
        training(["projecao", "ordenacao"]).columns,
      ),
    ).not.toThrow();
  });
  it.each(["postgres", "mssql", "sybase"] as const)(
    "fecha usos indiretos de agregação, escalar e UNION em %s",
    (dialect) => {
      const raw = training(["projecao", "filtro", "ordenacao"]);
      for (const sql of [
        "SELECT p.id FROM orders p GROUP BY p.id HAVING SUM(p.amount) > :minimum",
        "SELECT p.id FROM orders p ORDER BY SUM(p.amount)",
        "SELECT p.amount AS value FROM orders p UNION SELECT q.amount AS value FROM orders q",
        "SELECT (SELECT q.amount FROM orders q) AS value FROM orders p ORDER BY 1",
      ])
        expect(() => assertQueryFieldUses(parseSelect(sql, dialect), raw.columns), sql).toThrow();
      expect(() =>
        assertQueryFieldUses(
          parseSelect(
            "SELECT p.amount AS value FROM orders p UNION ALL SELECT q.amount AS value FROM orders q ORDER BY 1",
            dialect,
          ),
          training(["projecao"]).columns,
        ),
      ).toThrow();
    },
  );
  it("acompanha aliases em JOIN, projeção, união, agregação e ordenação multifonte", () => {
    const uses = federationFieldUses([
      { kind: "local", id: "a", sourceId: "a", publicationId: "a", columns: ["id", "amount"] },
      { kind: "local", id: "b", sourceId: "b", publicationId: "b", columns: ["id"] },
      {
        kind: "join",
        id: "j",
        left: "a",
        right: "b",
        join: "inner",
        cardinality: "one_to_one",
        keys: [{ left: "id", right: "id" }],
        columns: [{ side: "left", column: "amount", as: "value" }],
      },
      { kind: "project", id: "p", input: "j", columns: [{ column: "value", as: "renamed" }] },
      { kind: "union", id: "u", inputs: ["p", "p"] },
      {
        kind: "aggregate",
        id: "g",
        input: "u",
        dimensions: [],
        measures: [{ operation: "sum", column: "renamed", as: "total" }],
      },
      {
        kind: "sort",
        id: "s",
        input: "g",
        order: [{ column: "total", direction: "asc", nulls: "last" }],
      },
    ]);
    expect(uses).toEqual({
      a: { id: ["join"], amount: ["agrupamento", "ordenacao"] },
      b: { id: ["join"] },
    });
  });
});
