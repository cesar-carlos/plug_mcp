import { describe, expect, it } from "vitest";
import { compileQueryTraining } from "../../../src/application/persona-v2/query-training.js";
import {
  assertQueryCaseCoverage,
  queryRequiresCases,
} from "../../../src/application/persona-v2/query-test-policy.js";
import { NodeCryptoAdapter } from "../../../src/infrastructure/crypto/node-crypto.adapter.js";
import { queryTraining, trainingSource } from "../../helpers/persona-v2-training.js";
import { trainingTopic } from "../../../src/application/persona-v2/training-topics.js";
import { PERSONA_V2_TRAINING_BASE } from "../../../src/application/persona-v2/training-base.js";
import { PERSONA_V2_INSTRUCTIONS } from "../../../src/application/persona-v2/runtime-instructions.js";

const crypto = new NodeCryptoAdapter("a".repeat(64));
const metric = {
  id: "revenue",
  name: "Faturamento",
  definition: "Soma dos valores de pedidos",
  aggregation: "sum",
  inputs: [{ table: "orders", column: "amount" }],
  grain: [{ table: "orders", column: "id" }],
  unit: "BRL",
  timePolicy: "UTC, início inclusivo e fim exclusivo",
  filters: ["Pedidos confirmados"],
  nullPolicy: "Ignorar nulos",
  negativePolicy: "Deduzir devoluções",
  reconciliation: "Não multiplicar por itens; descontos já incluídos",
};
const compile = (extra: object = {}) =>
  compileQueryTraining({ ...queryTraining(), ...extra }, trainingSource, crypto);
describe("query quality and semantic contracts", () => {
  it("binds semantic definitions and synonyms to new grants without changing old snapshots", () => {
    const before = compile();
    const after = compile({ semantics: { version: 1, synonyms: ["receita"], metrics: [metric] } });
    expect(after.requiredCapabilities).not.toEqual(before.requiredCapabilities);
    expect(before.training).not.toHaveProperty("semantics");
    expect(after.scope).toEqual(before.scope);
    expect(queryRequiresCases(after)).toBe(true);
  });
  it.each([
    { ...metric, inputs: [{ table: "other", column: "amount" }] },
    { ...metric, grain: [{ table: "orders", column: "missing" }] },
    { ...metric, inputs: [metric.inputs[0], metric.inputs[0]] },
  ])("rejects untrained or repeated references", (value) => {
    expect(() => compile({ semantics: { version: 1, synonyms: [], metrics: [value] } })).toThrow();
  });
  it("rejects duplicate metrics and synonyms", () => {
    expect(() =>
      compile({ semantics: { version: 1, synonyms: [], metrics: [metric, metric] } }),
    ).toThrow();
    expect(() =>
      compile({ semantics: { version: 1, synonyms: ["Receita", "receita"], metrics: [] } }),
    ).toThrow();
  });
  it("requires cases for aggregates even inside a CTE and preserves simple-query compatibility", () => {
    expect(queryRequiresCases(compile())).toBe(false);
    const pkg = compile({
      sqlModel:
        "WITH totals AS (SELECT SUM(p.amount) AS total FROM orders p) SELECT t.total FROM totals t WHERE t.total > :minimum",
    });
    expect(queryRequiresCases(pkg)).toBe(true);
    expect(() => assertQueryCaseCoverage(pkg, [])).toThrow(/casos obrigatórios/);
    expect(() =>
      assertQueryCaseCoverage(pkg, [{ id: "case", required: false, content: {} }]),
    ).toThrow();
    expect(() =>
      assertQueryCaseCoverage(pkg, [{ id: "case", required: true, content: {} }]),
    ).not.toThrow();
  });
  it("offers bounded topic guides while preserving the complete default", () => {
    expect(trainingTopic()).toBe(PERSONA_V2_TRAINING_BASE);
    expect(trainingTopic("sql")).toHaveProperty("sqlSummaries");
    expect(trainingTopic("sql")).not.toHaveProperty("integrationCredentials");
    expect(trainingTopic("administration")).toHaveProperty("guidance");
    expect(trainingTopic("operations")).toHaveProperty("executionLimits");
    expect(trainingTopic("administration").contentHash).not.toBe(trainingTopic("sql").contentHash);
    expect(trainingTopic("sql").baseHash).toBe(PERSONA_V2_TRAINING_BASE.hash);
    expect(Buffer.byteLength(PERSONA_V2_INSTRUCTIONS, "utf8")).toBeLessThan(36000);
    expect(trainingTopic("sql").guidance).toContain("columns[].uses");
    expect(trainingTopic("knowledge").guidance).toContain("inspecionar_estrutura");
    expect(PERSONA_V2_INSTRUCTIONS).toContain("Runners de publicação são exclusivos do operador");
  });
  it("requires evidence for JOINs and analytical examples even with a simple main model", () => {
    const training = queryTraining();
    const joined = compile({
      sqlModel:
        "SELECT p.id, p.amount FROM orders p INNER JOIN customers c ON p.id = c.id WHERE p.id > :minimum ORDER BY p.id",
      tables: [...training.tables, { name: "customers", meaning: "Cliente", grain: ["id"] }],
      columns: [
        ...training.columns,
        { table: "customers", name: "id", meaning: "ID", classification: "livre" },
      ],
      relationships: [
        {
          from: "orders",
          to: "customers",
          keys: [{ from: "id", to: "id" }],
          join: "inner",
          cardinality: "N:1",
          meaning: "Cliente do pedido",
        },
      ],
    });
    expect(queryRequiresCases(joined)).toBe(true);
    const example = compile({
      examples: [
        {
          id: "total",
          purpose: "Total",
          explanation: "Soma",
          sql: "SELECT SUM(p.amount) AS total FROM orders p WHERE p.id > :minimum",
        },
      ],
    });
    expect(queryRequiresCases(example)).toBe(true);
  });
  it("does not let metric references disclose a forbidden field", () => {
    const training = queryTraining();
    expect(() =>
      compile({
        columns: [
          ...training.columns,
          { table: "orders", name: "secret", meaning: "Privado", classification: "segredo" },
        ],
        semantics: {
          version: 1,
          synonyms: [],
          metrics: [{ ...metric, inputs: [{ table: "orders", column: "secret" }] }],
        },
      }),
    ).toThrow(/campos executáveis/);
  });
});
