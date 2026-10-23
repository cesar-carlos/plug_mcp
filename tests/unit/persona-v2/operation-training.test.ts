import { describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import {
  operationTraining,
  operationInput,
  adaptiveOperationTraining,
  reconciledOperationTraining,
} from "../../helpers/persona-v2-operation.js";
import { compileOperationReconciliation } from "../../../src/application/persona-v2/operation-reconciliation.js";
import { trainingSource } from "../../helpers/persona-v2-training.js";
import { NodeCryptoAdapter } from "../../../src/infrastructure/crypto/node-crypto.adapter.js";
import {
  compileOperationCommand,
  compileOperationTraining,
} from "../../../src/application/persona-v2/operation-training.js";
const crypto = new NodeCryptoAdapter("a".repeat(64));
const compile = (t = operationTraining(), s = trainingSource) =>
  compileOperationTraining(t, s, crypto, "Pedidos");
describe("contrato publicado de lançamento", () => {
  it("não publica operações sobre a identidade técnica da base", () => {
    for (const name of ["se7e_source_identity"]) {
      const t = operationTraining();
      t.tables[0]!.name = name;
      expect(() => compile(t)).toThrow(/reservada/);
    }
    // The qualified marker stays reserved; quoted/noncanonical names are not training identifiers.
    for (const name of [
      "dba.se7e_source_identity",
      '"DBA"."se7e_source_identity"',
      "SE7E_SOURCE_IDENTITY",
    ]) {
      const t = operationTraining();
      t.tables[0]!.name = name;
      expect(() => compile(t)).toThrow();
    }
  });
  it("compila parâmetros sem aceitar SQL ou campos extras", () => {
    const pkg = compile();
    const cmd = compileOperationCommand(pkg, trainingSource, randomUUID(), operationInput, crypto);
    expect(cmd.steps[0]!.sql).toBe(
      'UPDATE "orders" SET "amount" = :v_amount WHERE "id" = :w_id AND "version" = :w_version RETURNING 1 AS "__operation_row"',
    );
    expect(cmd.steps[0]!.params.v_amount).toEqual({ kind: "value", scalar: operationInput.amount });
    expect(() =>
      compileOperationCommand(
        pkg,
        trainingSource,
        randomUUID(),
        { ...operationInput, sql: "DELETE FROM orders" },
        crypto,
      ),
    ).toThrow();
    expect(() =>
      compileOperationCommand(
        pkg,
        trainingSource,
        randomUUID(),
        { ...operationInput, id: { type: "integer", value: "9223372036854775808" } },
        crypto,
      ),
    ).toThrow();
  });
  it.each(["identity", "concurrency"] as const)(
    "recusa escrita sem %s e colunas não graváveis",
    (key) => {
      const t = operationTraining();
      t.steps[0]!.where = t.steps[0]!.where.filter((w) => !t.tables[0]![key].includes(w.column));
      expect(() => compile(t)).toThrow(/Identidade/);
      const forbidden = operationTraining();
      forbidden.steps[0]!.values[0]!.column = "id";
      expect(() => compile(forbidden)).toThrow(/gravação/);
    },
  );
  it("novos limites ou aprovação exigem concessão explícita do novo contrato", () => {
    const a = compile(),
      t = operationTraining();
    t.timeoutMs += 1;
    const b = compile(t);
    expect(a.requiredCapabilities.filter((c) => c.startsWith("operation-contract:"))).not.toEqual(
      b.requiredCapabilities.filter((c) => c.startsWith("operation-contract:")),
    );
    expect(operationTraining().approval).toBe("human");
  });
  it("aplica recorte dominante e não aceita binding do consumidor", () => {
    const t = operationTraining();
    t.tables[0]!.columns.push({
      name: "tenant_id",
      type: "integer",
      writable: false,
      meaning: "Empresa",
    });
    const s = {
      ...trainingSource,
      rowRestrictions: [
        { table: "orders", column: "tenant_id", parameter: "__scope_tenant", value: 7 },
      ],
    };
    const cmd = compileOperationCommand(compile(t, s), s, randomUUID(), operationInput, crypto);
    expect(cmd.steps[0]!.sql).toContain('AND "tenant_id" = :__scope_tenant');
    expect(cmd.steps[0]!.params.__scope_tenant).toEqual({
      kind: "value",
      scalar: { type: "integer", value: "7" },
    });
    expect(() =>
      compileOperationCommand(
        compile(t, s),
        s,
        randomUUID(),
        { ...operationInput, __scope_tenant: { type: "integer", value: "8" } },
        crypto,
      ),
    ).toThrow();
    t.steps[0]!.values.push({ column: "tenant_id", binding: { kind: "input", name: "id" } });
    expect(() => compile(t, s)).toThrow();
  });
  it.each(["postgres", "mssql", "sybase"] as const)(
    "emite gramática própria de %s sem fallback T-SQL",
    (dialect) => {
      const t = operationTraining();
      t.dialect = dialect;
      const s = { ...trainingSource, dialect };
      const cmd = compileOperationCommand(compile(t, s), s, randomUUID(), operationInput, crypto);
      expect(cmd.steps[0]!.sql).toContain(dialect === "postgres" ? '"orders"' : "[orders]");
    },
  );
  it("recusa scripts e referências futuras", () => {
    const t = operationTraining();
    t.steps[0]!.values[0]!.binding = { kind: "step_output", stepId: "future", output: "amount" };
    expect(() => compile(t)).toThrow(/futuro/);
    expect(() =>
      compile({
        ...operationTraining(),
        steps: [{ ...operationTraining().steps[0]!, table: "orders; DELETE FROM orders" }],
      }),
    ).toThrow();
  });
  it.each(["postgres", "mssql", "sybase"] as const)(
    "adaptação de %s preserva contrato e bindings",
    (dialect) => {
      const t = adaptiveOperationTraining();
      t.dialect = dialect;
      const s = { ...trainingSource, dialect };
      const pkg = compile(t, s),
        id = randomUUID();
      const parameters = { ...operationInput, ceiling: { type: "decimal", value: "100.00" } };
      const model = compileOperationCommand(pkg, s, id, { parameters }, crypto);
      const q = (v: string) => (dialect === "mssql" || dialect === "sybase" ? `[${v}]` : `"${v}"`);
      const sql = `update ${q("orders")} set ${q("amount")} = :v_amount where ${q("version")} = :w_version AND ${q("id")} = :w_id AND ${q("amount")} <= :a_0`;
      const adapted = compileOperationCommand(
        pkg,
        s,
        id,
        { parameters, sqlByStep: { change: sql } },
        crypto,
      );
      expect(adapted.steps[0]!.params.a_0).toEqual({ kind: "value", scalar: parameters.ceiling });
      expect(adapted.fingerprint).not.toBe(model.fingerprint);
      for (const forbidden of [
        sql.replace(`AND ${q("id")} = :w_id`, ""),
        sql.replace("AND", "OR"),
        sql + "; DELETE FROM orders",
        sql + " -- test",
        sql.replace(":a_0", "100"),
        sql.replace(":w_id", ":w_version"),
        sql.replace(q("orders"), "other.orders"),
        sql.replace("<=", ">="),
        sql.replace(":v_amount", ":a_0"),
        sql + ` AND ${q("id")} = :w_id`,
        sql.replace(q("amount"), q("id")),
      ])
        expect(() =>
          compileOperationCommand(
            pkg,
            s,
            id,
            { parameters, sqlByStep: { change: forbidden } },
            crypto,
          ),
        ).toThrow();
      expect(() =>
        compileOperationCommand(pkg, s, id, { parameters, sqlByStep: { other: sql } }, crypto),
      ).toThrow();
    },
  );
  it("SQL adaptável não pode remover recorte dominante", () => {
    const t = adaptiveOperationTraining();
    t.tables[0]!.columns.push({
      name: "tenant_id",
      type: "integer",
      writable: false,
      meaning: "Empresa",
    });
    const source = {
      ...trainingSource,
      rowRestrictions: [
        { table: "orders", column: "tenant_id", parameter: "__scope_tenant", value: 7 },
      ],
    };
    const pkg = compile(t, source),
      id = randomUUID(),
      parameters = { ...operationInput, ceiling: { type: "decimal", value: "100" } };
    const command = compileOperationCommand(pkg, source, id, { parameters }, crypto);
    expect(() =>
      compileOperationCommand(
        pkg,
        source,
        id,
        {
          parameters,
          sqlByStep: {
            change: command.steps[0]!.sql.replace(' AND "tenant_id" = :__scope_tenant', ""),
          },
        },
        crypto,
      ),
    ).toThrow();
  });
  it("conciliação publica marcador único da transação e concede leitura explicitamente", () => {
    const t = reconciledOperationTraining(),
      pkg = compile(t),
      id = randomUUID();
    const command = compileOperationCommand(pkg, trainingSource, id, operationInput, crypto);
    expect(command.steps[1]!.params.v_operation_id).toEqual({
      kind: "value",
      scalar: { type: "uuid", value: id },
    });
    expect(pkg.requiredCapabilities).toContain(
      `source:${trainingSource.id}:table:operation_ledger:select`,
    );
    expect(compileOperationReconciliation(pkg, trainingSource, id).params.operation_id!.value).toBe(
      id,
    );
    t.steps[1]!.values[0]!.binding = { kind: "input", name: "id" };
    expect(() => compile(t)).toThrow();
  });
  it.each(["postgres", "mssql", "sybase"] as const)(
    "conciliação de %s mantém recorte com binding do servidor",
    (dialect) => {
      const t = reconciledOperationTraining();
      t.dialect = dialect;
      t.tables[1]!.columns.push({
        name: "tenant_id",
        type: "integer",
        writable: false,
        meaning: "Empresa",
      });
      const source = {
        ...trainingSource,
        dialect,
        rowRestrictions: [
          { table: "operation_ledger", column: "tenant_id", parameter: "__scope_tenant", value: 7 },
        ],
      };
      const pkg = compile(t, source),
        id = randomUUID();
      const command = compileOperationCommand(pkg, source, id, operationInput, crypto);
      const query = compileOperationReconciliation(pkg, source, id);
      expect(command.steps[1]!.params.__scope_tenant).toEqual({
        kind: "value",
        scalar: { type: "integer", value: "7" },
      });
      expect(query.params.__scope_tenant).toEqual({ type: "integer", value: "7" });
      expect(query.sql).toContain("AND ");
      expect(query.sql).toContain(":__scope_tenant");
      expect(query.sql).toContain(
        dialect === "postgres" ? '"operation_ledger"' : "[operation_ledger]",
      );
    },
  );
  it.each(["postgres", "mssql"] as const)(
    "adaptação de %s preserva saídas publicadas",
    (dialect) => {
      const t = adaptiveOperationTraining();
      t.dialect = dialect;
      t.steps[0]!.outputs = [{ column: "amount", type: "decimal" }];
      const source = { ...trainingSource, dialect },
        pkg = compile(t, source),
        id = randomUUID();
      const parameters = { ...operationInput, ceiling: { type: "decimal", value: "100" } };
      const model = compileOperationCommand(pkg, source, id, { parameters }, crypto);
      const sql = model.steps[0]!.sql;
      const approved = compileOperationCommand(
        pkg,
        source,
        id,
        { parameters, sqlByStep: { change: sql } },
        crypto,
      );
      expect(approved.steps[0]!.outputs).toEqual({ amount: "decimal" });
      const changed =
        dialect === "mssql"
          ? sql.replace("INSERTED.[amount]", "INSERTED.[id]")
          : sql.replace(/RETURNING [\s\S]+$/, 'RETURNING "id"');
      expect(() =>
        compileOperationCommand(
          pkg,
          source,
          id,
          { parameters, sqlByStep: { change: changed } },
          crypto,
        ),
      ).toThrow();
    },
  );
  it("reordena SET sem trocar valores ou deixar de gravar colunas", () => {
    const t = adaptiveOperationTraining();
    t.tables[0]!.columns.find((c) => c.name === "version")!.writable = true;
    t.steps[0]!.values.push({ column: "version", binding: { kind: "input", name: "version" } });
    const pkg = compile(t),
      id = randomUUID(),
      parameters = { ...operationInput, ceiling: { type: "decimal", value: "100" } };
    const sql =
      'UPDATE "orders" SET "version" = :v_version, "amount" = :v_amount WHERE "id" = :w_id AND "version" = :w_version';
    expect(
      compileOperationCommand(
        pkg,
        trainingSource,
        id,
        { parameters, sqlByStep: { change: sql } },
        crypto,
      ).steps[0]!.sql,
    ).toContain('"version" = :v_version');
    expect(() =>
      compileOperationCommand(
        pkg,
        trainingSource,
        id,
        { parameters, sqlByStep: { change: sql.replace('"version" = :v_version, ', "") } },
        crypto,
      ),
    ).toThrow();
  });
});
