import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import {
  quoteOperationTable,
  operationTableFromSql,
} from "../../../src/domain/persona-v2/operation-identifiers.js";
import {
  compileOperationCommand,
  compileOperationTraining,
} from "../../../src/application/persona-v2/operation-training.js";
import { compileOperationReconciliation } from "../../../src/application/persona-v2/operation-reconciliation.js";
import { NodeCryptoAdapter } from "../../../src/infrastructure/crypto/node-crypto.adapter.js";
import { trainingSource } from "../../helpers/persona-v2-training.js";
import {
  operationTraining,
  operationInput,
  reconciledOperationTraining,
} from "../../helpers/persona-v2-operation.js";

const crypto = new NodeCryptoAdapter("ab".repeat(32));
describe("identidade física de tabelas em operações", () => {
  it.each([
    ["postgres", "public.orders", '"public"."orders"'],
    ["mssql", "dbo.orders", "[dbo].[orders]"],
    ["sybase", "dba.orders", "[dba].[orders]"],
  ] as const)("preserva alvo físico e concessões em %s", (dialect, table, quoted) => {
    const source = { ...trainingSource, dialect },
      t = operationTraining();
    t.dialect = dialect;
    t.tables[0]!.name = table;
    t.steps[0]!.table = table;
    const pkg = compileOperationTraining(t, source, crypto, "Fixture");
    const command = compileOperationCommand(pkg, source, randomUUID(), operationInput, crypto);
    expect(command.steps[0]!.sql).toContain(`UPDATE ${quoted} SET`);
    expect(pkg.requiredCapabilities).toContain(`source:${source.id}:table:${table}:update`);
    expect(operationTableFromSql(command.steps[0]!.sql, "update")).toBe(table);
    expect(quoteOperationTable(table, dialect)).toBe(quoted);
    for (const effect of ["select", "insert", "delete"] as const) {
      const sql =
        effect === "select"
          ? `SELECT "id" FROM ${quoted} WHERE "id" = :id`
          : effect === "insert"
            ? `INSERT INTO ${quoted} ("id") VALUES (:id)`
            : `DELETE FROM ${quoted} WHERE "id" = :id`;
      expect(operationTableFromSql(sql, effect)).toBe(table);
    }
  });
  it.each([
    "other.public.orders",
    "public..orders",
    "public.",
    '"public.orders"',
    "PUBLIC.orders",
    "public.orders;drop",
    "dba.se7e_source_identity",
  ])("recusa treinamento sobre alvo inválido/reservado %s", (table) => {
    const t = operationTraining();
    t.tables[0]!.name = table;
    t.steps[0]!.table = table;
    expect(() => compileOperationTraining(t, trainingSource, crypto, "Fixture")).toThrow();
  });
  it("recorte simples não pode desaparecer ao qualificar a tabela", () => {
    const t = operationTraining();
    t.tables[0]!.name = "public.orders";
    t.steps[0]!.table = "public.orders";
    const source = {
      ...trainingSource,
      rowRestrictions: [{ table: "orders", column: "id", parameter: "__scope_id", value: 1 }],
    };
    expect(() => compileOperationTraining(t, source, crypto, "Fixture")).toThrow(/ambíguo/);
  });
  it("recorte qualificado é injetado com valor do servidor no alvo correto", () => {
    const t = operationTraining();
    t.tables[0]!.name = "public.orders";
    t.steps[0]!.table = "public.orders";
    t.tables[0]!.columns.push({
      name: "tenant_id",
      type: "integer",
      writable: false,
      meaning: "Empresa",
    });
    const source = {
      ...trainingSource,
      rowRestrictions: [
        { table: "public.orders", column: "tenant_id", parameter: "__scope_tenant", value: 7 },
      ],
    };
    const pkg = compileOperationTraining(t, source, crypto, "Fixture");
    const command = compileOperationCommand(pkg, source, randomUUID(), operationInput, crypto);
    expect(command.steps[0]!.sql).toContain('AND "tenant_id" = :__scope_tenant');
    expect(command.steps[0]!.params.__scope_tenant).toEqual({
      kind: "value",
      scalar: { type: "integer", value: "7" },
    });
    expect(() =>
      compileOperationCommand(
        pkg,
        source,
        randomUUID(),
        { ...operationInput, __scope_tenant: { type: "integer", value: "8" } },
        crypto,
      ),
    ).toThrow();
  });
  it("conciliação cita schema e tabela separadamente e preserva vínculo", () => {
    const t = reconciledOperationTraining();
    t.tables[1]!.name = "audit.operation_ledger";
    t.steps[1]!.table = "audit.operation_ledger";
    t.reconciliationQuery!.table = "audit.operation_ledger";
    const pkg = compileOperationTraining(t, trainingSource, crypto, "Fixture");
    const query = compileOperationReconciliation(pkg, trainingSource, randomUUID());
    expect(query.sql).toContain('FROM "audit"."operation_ledger" WHERE');
    expect(query.table).toBe("audit.operation_ledger");
  });
  it.each(["postgres", "mssql", "sybase"] as const)(
    "SQL adaptável de %s conserva namespace e recusa homônimo",
    (dialect) => {
      const source = { ...trainingSource, dialect },
        t = operationTraining();
      t.dialect = dialect;
      t.mode = "sql_adaptavel";
      t.tables[0]!.name = "trusted.orders";
      t.steps[0]!.table = "trusted.orders";
      const pkg = compileOperationTraining(t, source, crypto, "Fixture"),
        id = randomUUID();
      const model = compileOperationCommand(
        pkg,
        source,
        id,
        { parameters: operationInput },
        crypto,
      ).steps[0]!.sql.replace(' RETURNING 1 AS "__operation_row"', "");
      const accepted = compileOperationCommand(
        pkg,
        source,
        id,
        { parameters: operationInput, sqlByStep: { change: model } },
        crypto,
      );
      expect(operationTableFromSql(accepted.steps[0]!.sql, "update")).toBe("trusted.orders");
      for (const sql of [
        model.replace("trusted", "other"),
        model.replace(dialect === "postgres" ? '"trusted".' : "[trusted].", ""),
      ]) {
        expect(() =>
          compileOperationCommand(
            pkg,
            source,
            id,
            { parameters: operationInput, sqlByStep: { change: sql } },
            crypto,
          ),
        ).toThrow();
      }
    },
  );
  it("helper de output SQL Anywhere usa o mesmo recurso qualificado", () => {
    const source = { ...trainingSource, dialect: "sybase" as const },
      t = operationTraining();
    t.dialect = "sybase";
    t.tables[0]!.name = "dba.orders";
    t.steps[0]!.table = "dba.orders";
    t.steps[0]!.outputs = [{ column: "id", type: "integer" }];
    const pkg = compileOperationTraining(t, source, crypto, "Fixture");
    const command = compileOperationCommand(pkg, source, randomUUID(), operationInput, crypto);
    expect(command.steps).toHaveLength(2);
    expect(command.steps.map((s) => operationTableFromSql(s.sql, s.effect))).toEqual([
      "dba.orders",
      "dba.orders",
    ]);
    expect(pkg.requiredCapabilities).toContain(`source:${source.id}:table:dba.orders:select`);
  });
});
