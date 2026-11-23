import { expect, it } from "vitest";
import {
  compileQueryTraining,
  queryTrainingSchema,
} from "../../../src/application/persona-v2/query-training.js";
import { assertExistenceOnlyTables } from "../../../src/application/persona-v2/query-existence-only.js";
import { parseSelect } from "../../../src/application/use-cases/shared/sql-ast.js";
import { assertSourcePagination } from "../../../src/application/persona-v2/source-sql.js";
import { queryTraining, trainingSource } from "../../helpers/persona-v2-training.js";
import { NodeCryptoAdapter } from "../../../src/infrastructure/crypto/node-crypto.adapter.js";
import { operationTraining } from "../../helpers/persona-v2-operation.js";
import { operationTrainingSchema } from "../../../src/domain/persona-v2/operation-training.js";
import { trainingTopic } from "../../../src/application/persona-v2/training-topics.js";
const crypto = new NodeCryptoAdapter("a".repeat(64));
it("contrato DML não recebe exceção e guia entregue explica limites", () => {
  const operation = operationTraining(trainingSource.id);
  expect(operationTrainingSchema.safeParse(operation).success).toBe(true);
  expect(
    operationTrainingSchema.safeParse({
      ...operation,
      tables: operation.tables.map((t) => ({ ...t, existenceOnly: true, grain: [] })),
    }).success,
  ).toBe(false);
  expect(trainingTopic("sql").existenceOnlyTables).toContain("knowledge");
  expect(trainingTopic("knowledge").existenceOnlyTables).toContain(
    "JOIN/projeção direta/limites internos",
  );
});
const predicate =
  "EXISTS (SELECT 1 FROM parcels x WHERE x.company=p.company AND x.sale=p.id AND x.flag='Sim')";
function training(sql = `SELECT p.id FROM orders p WHERE ${predicate} ORDER BY id`) {
  const base = queryTraining();
  return {
    ...base,
    sqlModel: sql,
    tables: [
      ...base.tables,
      {
        name: "parcels",
        meaning: "Parcelas sem identidade comprovada",
        grain: [],
        existenceOnly: true as const,
      },
    ],
    columns: [
      ...base.columns,
      ...[
        ["orders", "company"],
        ["parcels", "company"],
        ["parcels", "sale"],
        ["parcels", "flag"],
      ].map(([table, name]) => ({
        table: table!,
        name: name!,
        meaning: "Sintético",
        classification: "livre" as const,
      })),
    ],
    relationships: [
      {
        from: "parcels",
        to: "orders",
        join: "inner" as const,
        meaning: "Parcelas da venda",
        cardinality: "N:1" as const,
        keys: [
          { from: "company", to: "company" },
          { from: "sale", to: "id" },
        ],
      },
    ],
  };
}
it.each(["postgres", "mssql", "sybase"] as const)(
  "%s aceita EXISTS/NOT EXISTS e CASE sem grão fictício",
  (dialect) => {
    for (const sql of [
      `SELECT p.id FROM orders p WHERE ${predicate} ORDER BY id`,
      `SELECT p.id FROM orders p WHERE NOT ${predicate} ORDER BY id`,
      `SELECT p.id, CASE WHEN ${predicate} THEN 'SIM' ELSE 'NAO' END AS flag FROM orders p WHERE p.id>:minimum ORDER BY id`,
    ]) {
      const input = { ...training(sql), dialect };
      const pkg = compileQueryTraining(input, { ...trainingSource, dialect }, crypto);
      expect(pkg.scope.graoPorTabela).not.toHaveProperty("parcels");
      expect(pkg.scope.graosConfirmados).not.toHaveProperty("parcels");
      expect(() =>
        assertSourcePagination(parseSelect(sql, dialect), { page: 1, pageSize: 30 }),
      ).not.toThrow();
    }
  },
);
it.each([
  "SELECT x.flag FROM parcels x WHERE x.sale=1",
  "SELECT p.id FROM orders p JOIN parcels x ON x.company=p.company AND x.sale=p.id WHERE p.id>0",
  "SELECT (SELECT x.flag FROM parcels x WHERE x.sale=p.id) AS flag FROM orders p WHERE p.id>0",
  "WITH x AS (SELECT sale FROM parcels WHERE sale>0) SELECT sale FROM x",
  "SELECT p.id FROM orders p WHERE EXISTS (SELECT x.flag FROM parcels x WHERE x.sale=p.id)",
  "SELECT p.id FROM orders p WHERE EXISTS (SELECT 1 FROM parcels x WHERE x.sale=1)",
  "SELECT p.id FROM orders p WHERE EXISTS (SELECT 1 FROM parcels x WHERE x.sale=p.id OR x.flag='Sim')",
  "SELECT p.id FROM orders p WHERE EXISTS (SELECT COUNT(*) FROM parcels x WHERE x.sale=p.id)",
  "SELECT p.id FROM orders p WHERE EXISTS (SELECT 1 FROM parcels x WHERE x.sale=p.id ORDER BY x.sale)",
  "SELECT p.id FROM orders p WHERE EXISTS (SELECT TOP 1 1 FROM parcels x WHERE x.sale=p.id)",
  "SELECT p.id FROM orders p WHERE EXISTS (SELECT 1 FROM parcels p WHERE p.sale=p.id)",
  "SELECT p.id FROM orders p GROUP BY p.id HAVING EXISTS (SELECT 1 FROM parcels x WHERE x.sale=p.id)",
  "SELECT p.id FROM orders p WHERE EXISTS (SELECT 1 FROM parcels x WHERE x.sale=p.id UNION ALL SELECT 1 FROM parcels y WHERE y.sale=p.id)",
])("recusa ampliação de tabela restrita: %s", (sql) => {
  expect(() => assertExistenceOnlyTables(parseSelect(sql, "mssql"), training().tables)).toThrow();
});
it("chaves de correlação completas e escopo continuam obrigatórios", () => {
  for (const sql of [
    `SELECT p.id FROM orders p WHERE ${predicate.replace("x.company=p.company AND ", "")}`,
    `SELECT p.id FROM orders p WHERE ${predicate.replace("x.flag", "x.secret")}`,
  ])
    expect(() => compileQueryTraining(training(sql), trainingSource, crypto)).toThrow();
});
it("correlação ancestral preserva chaves em cada ramo e não duplica a subconsulta", () => {
  const sql = `SELECT p.id FROM orders p WHERE EXISTS (SELECT 1 FROM orders t WHERE t.id=p.id AND (${predicate} OR NOT ${predicate})) ORDER BY id`;
  const raw = training(sql);
  const input = {
    ...raw,
    relationships: [
      ...raw.relationships,
      {
        from: "orders",
        to: "orders",
        join: "inner" as const,
        cardinality: "1:1" as const,
        meaning: "Mesmo pedido",
        keys: [{ from: "id", to: "id" }],
      },
    ],
  };
  expect(() => compileQueryTraining(input, trainingSource, crypto)).not.toThrow();
  const ast = parseSelect(sql, "postgres");
  expect(ast.subqueries).toHaveLength(1);
  expect(ast.subqueries[0]!.subqueries).toHaveLength(2);
  expect(() =>
    compileQueryTraining(
      {
        ...input,
        sqlModel: sql.replace(
          "x.company=p.company AND x.sale=p.id",
          "x.company=p.company OR x.sale=p.id",
        ),
      },
      trainingSource,
      crypto,
    ),
  ).toThrow();
});
it("grain vazio sem opt-in e grão com opt-in continuam inválidos", () => {
  const input = training();
  expect(
    queryTrainingSchema.safeParse({
      ...input,
      tables: [{ name: "orders", meaning: "Pedido", grain: [] }],
    }).success,
  ).toBe(false);
  expect(
    queryTrainingSchema.safeParse({
      ...input,
      tables: input.tables.map((t) => (t.name === "parcels" ? { ...t, grain: ["sale"] } : t)),
    }).success,
  ).toBe(false);
});
it("CASE não dispensa finalidade de projeção da informação inferida", () => {
  const sql = `SELECT p.id, CASE WHEN ${predicate} THEN 'SIM' ELSE 'NAO' END AS flag FROM orders p WHERE p.id>:minimum`;
  const input = training(sql);
  expect(() =>
    compileQueryTraining(
      {
        ...input,
        columns: input.columns.map((c) =>
          c.table === "parcels" ? { ...c, uses: ["filtro"], usePurpose: "Filtro" } : c,
        ),
      },
      trainingSource,
      crypto,
    ),
  ).toThrow();
});
it("mudança para existência altera contrato; grão normal não herda a exceção", () => {
  const raw = training();
  const limited = compileQueryTraining(raw, trainingSource, crypto);
  const normal = compileQueryTraining(
    {
      ...raw,
      tables: raw.tables.map((t) =>
        t.name === "parcels" ? { name: t.name, meaning: t.meaning, grain: ["company", "sale"] } : t,
      ),
    },
    trainingSource,
    crypto,
  );
  expect(limited.requiredCapabilities.find((c) => c.startsWith("query-contract:"))).not.toBe(
    normal.requiredCapabilities.find((c) => c.startsWith("query-contract:")),
  );
});
it("preserva identificadores qualificados com maiúsculas sem permitir origem externa", () => {
  const sql =
    "SELECT p.Id FROM dbo.Orders p WHERE EXISTS (SELECT 1 FROM dbo.Parcels x WHERE x.Sale=p.Id)";
  const parse = (text: string) => parseSelect(text, "mssql", { allowSchemaQualifiedTables: true });
  expect(() =>
    assertExistenceOnlyTables(parse(sql), [{ name: "dbo.parcels", existenceOnly: true }]),
  ).not.toThrow();
  expect(() => parse(sql.replace("dbo.Parcels", "other.dbo.Parcels"))).toThrow();
});
it("base geral entrega convenções de namespace subordinadas ao escopo publicado", () => {
  const sql = String(trainingTopic().sql);
  expect(sql).toContain("SQL Server dbo; SQL Anywhere dba");
  expect(sql).toContain("namespace físico no escopo publicado");
  expect(sql).toContain("não substitua globalmente");
  expect(sql).toContain("não use parâmetro para schema");
  expect(sql).toContain("não transfira aprovação entre motores");
});
