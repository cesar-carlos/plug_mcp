import { describe, expect, it } from "vitest";
import { validateStructureContent } from "../../../src/application/persona-v2/shared-structure-schema.js";
import { NodeCryptoAdapter } from "../../../src/infrastructure/crypto/node-crypto.adapter.js";
import { structureContent } from "../../helpers/persona-v2-structure.js";
import { compileQueryTraining } from "../../../src/application/persona-v2/query-training.js";
import { queryTraining, trainingSource } from "../../helpers/persona-v2-training.js";
import { compareStructureContent } from "../../../src/application/persona-v2/shared-structure-diff.js";

const crypto = new NodeCryptoAdapter("a".repeat(64));
describe("shared structure proposals", () => {
  it("validates explicit SQL variants without attesting a database", () => {
    const content = validateStructureContent(structureContent(), crypto);
    expect(content.examples[0]!.variants).toHaveLength(3);
    expect(content.dialects).not.toContain("firebird");
  });
  it.each([
    "DELETE FROM orders WHERE id=:minimum",
    "SELECT p.secret FROM orders p",
    "SELECT x.id FROM unknown_table x",
  ])("rejects unsafe examples, including inactive proposals: %s", (sql) => {
    const content = structuredClone(structureContent());
    const modified = {
      ...content,
      examples: content.examples.map((e) => ({
        ...e,
        state: "inactive" as const,
        variants: e.variants.map((v) => ({ ...v, sql })),
      })),
    };
    expect(() => validateStructureContent(modified, crypto)).toThrow();
  });
  it("rejects duplicate identities, physical aliases and invalid composite keys", () => {
    const content = structureContent();
    expect(() =>
      validateStructureContent(
        { ...content, tables: [...content.tables, content.tables[0]] },
        crypto,
      ),
    ).toThrow();
    expect(() =>
      validateStructureContent({ ...content, dialects: ["postgres", "postgres"] }, crypto),
    ).toThrow();
    expect(() =>
      validateStructureContent(
        {
          ...content,
          relationships: [
            {
              id: "wrong",
              from: "orders",
              to: "orders",
              keys: [{ from: "id", to: "missing" }],
              cardinality: "N:1",
              join: "left",
              optional: true,
              meaning: "Proposta incorreta",
              via: [],
            },
          ],
        },
        crypto,
      ),
    ).toThrow();
  });
  it("rejects user-supplied claims of technical verification", () => {
    expect(() =>
      validateStructureContent({ ...structureContent(), technicallyVerified: true }, crypto),
    ).toThrow();
  });
  it("stores native representations and declared key state without treating import as proof", () => {
    const before = structureContent(),
      table = before.tables[0]!;
    const proposed = {
      ...before,
      tables: [
        {
          ...table,
          keys: [{ id: "orders-pk", kind: "primary", columns: ["id"], status: "enabled" }],
          columns: table.columns.map((c) =>
            c.name === "amount"
              ? {
                  ...c,
                  unit: "BRL",
                  currency: "BRL",
                  nativeTypes: [{ dialect: "mssql", type: "decimal", precision: 18, scale: 2 }],
                }
              : c,
          ),
        },
      ],
    };
    expect(validateStructureContent(proposed, crypto).tables[0]!.keys?.[0]?.status).toBe("enabled");
    expect(() =>
      validateStructureContent(
        {
          ...proposed,
          tables: [
            {
              ...proposed.tables[0],
              keys: [{ id: "bad", kind: "unique", columns: ["missing"], status: "unknown" }],
            },
          ],
        },
        crypto,
      ),
    ).toThrow();
    expect(() =>
      validateStructureContent(
        {
          ...proposed,
          tables: [
            {
              ...proposed.tables[0],
              columns: table.columns.map((c) => ({
                ...c,
                nativeTypes: [{ dialect: "postgres", type: "numeric", precision: 2, scale: 3 }],
              })),
            },
          ],
        },
        crypto,
      ),
    ).toThrow();
  });
  it("requires a complete explicit path for an N:N relationship through a bridge", () => {
    const before = structureContent(),
      orders = before.tables[0]!,
      idColumn = orders.columns[0]!;
    const proposed = {
      ...before,
      tables: [
        orders,
        { ...orders, id: "products", name: "products", columns: [idColumn] },
        {
          ...orders,
          id: "lines",
          name: "lines",
          grain: ["order_id", "product_id"],
          columns: [
            { ...idColumn, name: "order_id" },
            { ...idColumn, name: "product_id" },
          ],
        },
      ],
      relationships: [
        {
          id: "order-lines",
          from: "orders",
          to: "lines",
          keys: [{ from: "id", to: "order_id" }],
          join: "inner",
          cardinality: "1:N",
          optional: false,
          meaning: "Itens do pedido sintético",
          via: [],
        },
        {
          id: "line-products",
          from: "lines",
          to: "products",
          keys: [{ from: "product_id", to: "id" }],
          join: "inner",
          cardinality: "N:1",
          optional: false,
          meaning: "Produto sintético do item",
          via: [],
        },
        {
          id: "order-products",
          from: "orders",
          to: "products",
          keys: [{ from: "id", to: "id" }],
          join: "inner",
          cardinality: "N:N",
          optional: false,
          meaning: "Associação sintética via itens",
          via: ["lines"],
          path: ["order-lines", "line-products"],
          origin: "business",
        },
      ],
    };
    expect(validateStructureContent(proposed, crypto).relationships[2]!.path).toEqual([
      "order-lines",
      "line-products",
    ]);
    for (const path of [
      [],
      ["line-products", "order-lines"],
      ["order-products", "line-products"],
    ]) {
      expect(() =>
        validateStructureContent(
          {
            ...proposed,
            relationships: proposed.relationships.map((r) =>
              r.id === "order-products" ? { ...r, path } : r,
            ),
          },
          crypto,
        ),
      ).toThrow();
    }
  });
  it("compares semantic, classification and SQL changes without declaring compatibility", () => {
    const before = structureContent();
    const after = {
      ...before,
      tables: before.tables.map((t) => ({
        ...t,
        columns: t.columns.map((c) =>
          c.name === "amount"
            ? { ...c, classification: "sensivel" as const, meaning: "Significado revisado" }
            : c,
        ),
      })),
      examples: before.examples.map((e) => ({
        ...e,
        variants: e.variants.map((v) =>
          v.dialect === "postgres" ? { ...v, sql: "SELECT p.id FROM orders p" } : v,
        ),
      })),
    };
    const changes = compareStructureContent(before, after);
    expect(changes).toContainEqual({
      kind: "changed",
      path: "tables/orders/columns/amount/classification",
    });
    expect(changes).toContainEqual({
      kind: "changed",
      path: "tables/orders/columns/amount/meaning",
    });
    expect(changes.some((c) => c.path.endsWith("/variants/postgres/sql"))).toBe(true);
    expect(changes.some((c) => c.path.endsWith("/variants/mssql/sql"))).toBe(false);
    expect(
      compareStructureContent(before, {
        ...before,
        tables: before.tables.map((t) => ({ ...t, columns: [...t.columns].reverse() })),
      }),
    ).toEqual([]);
    expect(
      compareStructureContent(before, { ...before, rules: [...before.rules, "Nova restrição"] }),
    ).toEqual([{ kind: "changed", path: "rules" }]);
  });
  it("validates every additional query example and freezes its contract", () => {
    const training = queryTraining();
    const examples = [
      {
        id: "ids",
        purpose: "Identificadores",
        explanation: "Projeção reduzida",
        sql: "SELECT p.id FROM orders p WHERE p.id > :minimum ORDER BY p.id",
      },
    ];
    const before = compileQueryTraining(training, trainingSource, crypto);
    const after = compileQueryTraining({ ...training, examples }, trainingSource, crypto);
    expect(after.requiredCapabilities).not.toEqual(before.requiredCapabilities);
    expect(() =>
      compileQueryTraining(
        { ...training, examples: [{ ...examples[0], sql: "DELETE FROM orders" }] },
        trainingSource,
        crypto,
      ),
    ).toThrow();
    expect(() =>
      compileQueryTraining(
        {
          ...training,
          examples: [{ ...examples[0], sql: "SELECT p.id FROM orders p WHERE p.id=:untyped" }],
        },
        trainingSource,
        crypto,
      ),
    ).toThrow(/parâmetro/);
    expect(() =>
      compileQueryTraining(
        { ...training, examples: [...examples, ...examples] },
        trainingSource,
        crypto,
      ),
    ).toThrow(/duplicada/);
  });
});
