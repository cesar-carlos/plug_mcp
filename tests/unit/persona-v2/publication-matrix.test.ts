import { expect, it } from "vitest";
import { fixtureTablesSchema } from "../../../src/domain/persona-v2/publication-fixture.js";
import { matrixTables } from "../../helpers/persona-publication-matrix.js";
import { caseValue } from "../../../src/application/persona-v2/publication-case-values.js";

it.each(["reversed", "overflow", "sql", "unknown-column", "wrong-type"])(
  "CHECK fechado recusa %s",
  (kind) => {
    const tables = structuredClone(matrixTables);
    const checked = tables.find((t) => t.table === "publication_checked")!;
    const check = checked.checks[0]!;
    if (kind === "reversed") check.min = "11";
    if (kind === "overflow") check.max = "9223372036854775808";
    if (kind === "sql") check.min = "0 OR 1=1";
    if (kind === "unknown-column") check.column = "absent";
    if (kind === "wrong-type") checked.columns[1]!.type = "string";
    expect(fixtureTablesSchema.safeParse(tables).success).toBe(false);
  },
);
it("não aceita ação de cascata desconhecida ou script", () => {
  const tables = structuredClone(matrixTables);
  const fk = tables.find((t) => t.table === "publication_cascade_child")!.foreignKeys[0]!;
  Object.assign(fk, { onDelete: "set_null" });
  expect(fixtureTablesSchema.safeParse(tables).success).toBe(false);
});
it.each(["duplicate-target", "chain", "sql"])("UPDATE/DELETE recusam %s", (kind) => {
  const tables = structuredClone(matrixTables);
  const source = tables.find((t) => t.table === "publication_mutation_source")!;
  if (kind === "duplicate-target") source.deleteAudit = { ...source.updateAudit! };
  if (kind === "chain")
    tables.find((t) => t.table === source.updateAudit!.targetTable)!.deleteAudit = {
      targetTable: source.table,
    };
  if (kind === "sql") Object.assign(source.updateAudit!, { sql: "DELETE FROM business" });
  expect(fixtureTablesSchema.safeParse(tables).success).toBe(false);
});

it("normaliza decimal textual sem zero inteiro preservando precisão e sinal", () => {
  expect(caseValue("-.00000001", "decimal")).toBe("-0.00000001");
  expect(caseValue(".50000000", "decimal")).toBe("0.5");
  expect(caseValue("-.00000000", "decimal")).toBe("0");
  expect(caseValue("12345678901234567890.12345678", "decimal")).toBe(
    "12345678901234567890.12345678",
  );
  for (const value of ["", ".", "-.", "1e-8", "NaN", "1,50"])
    expect(() => caseValue(value, "decimal")).toThrow();
  expect(() => caseValue(0.00000001, "decimal")).toThrow();
});

it("aceita FK composta e trigger de auditoria tipados sem SQL de setup", () => {
  expect(fixtureTablesSchema.safeParse(matrixTables).success).toBe(true);
});
it.each(["inverted", "missing", "type", "unkeyed", "forward"])(
  "recusa referência estrutural inválida: %s",
  (kind) => {
    const tables = structuredClone(matrixTables);
    const parent = tables.find((t) => t.table === "publication_parent")!;
    const child = tables.find((t) => t.table === "publication_child")!;
    if (kind === "inverted") child.foreignKeys[0]!.targetColumns.reverse();
    if (kind === "missing") child.foreignKeys[0]!.columns[0] = "absent";
    if (kind === "type") child.columns[1]!.type = "string";
    if (kind === "unkeyed") parent.primaryKey = ["id"];
    if (kind === "forward") tables.reverse();
    expect(fixtureTablesSchema.safeParse(tables).success).toBe(false);
  },
);
it.each(["self", "chain", "columns", "sql"])(
  "recusa trigger fora do contrato fechado: %s",
  (kind) => {
    const tables = structuredClone(matrixTables);
    const source = tables.find((t) => t.insertAudit)!;
    const target = tables.find((t) => t.table === source.insertAudit!.targetTable)!;
    if (kind === "self") source.insertAudit!.targetTable = source.table;
    if (kind === "chain") target.insertAudit = { targetTable: source.table };
    if (kind === "columns") target.columns[1]!.nullable = false;
    if (kind === "sql") Object.assign(source.insertAudit!, { sql: "DELETE FROM business" });
    expect(fixtureTablesSchema.safeParse(tables).success).toBe(false);
  },
);
