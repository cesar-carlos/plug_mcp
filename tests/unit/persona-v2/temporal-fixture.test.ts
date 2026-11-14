import { expect, it } from "vitest";
import {
  fixtureTableSchema,
  fixtureTablesSchema,
} from "../../../src/domain/persona-v2/publication-fixture.js";
import { campoSalesTables } from "../../../scripts/homologation/campo-sales-fixtures.js";
const table = (type: string, temporalStorage?: string) => ({
  table: "publication_dates",
  primaryKey: ["id"],
  columns: [
    { name: "id", type: "integer" },
    { name: "value", type, ...(temporalStorage ? { temporalStorage } : {}) },
  ],
});
it("declares millisecond storage explicitly without changing scalar date", () => {
  expect(fixtureTableSchema.parse(table("date", "datetime2_3")).columns[1]).toMatchObject({
    type: "date",
    temporalStorage: "datetime2_3",
  });
  expect(
    campoSalesTables("vendas-resumo")[0]!.columns.find((c) => c.name === "datavenda"),
  ).toMatchObject({ type: "date", temporalStorage: "datetime2_3" });
});
it("preserves legacy DATE and rejects invalid temporal declarations", () => {
  expect(fixtureTableSchema.parse(table("date")).columns[1]).not.toHaveProperty("temporalStorage");
  for (const [type, storage] of [
    ["integer", "datetime2_3"],
    ["date", "datetime"],
    ["string", "datetime2_3"],
  ])
    expect(fixtureTableSchema.safeParse(table(type!, storage)).success).toBe(false);
});
it("requires identical temporal storage for FK and audit copies", () => {
  const parent = { ...table("date", "datetime2_3"), uniqueKeys: [["value"]] };
  const child = {
    ...table("date"),
    table: "publication_child",
    foreignKeys: [{ columns: ["value"], targetTable: parent.table, targetColumns: ["value"] }],
  };
  expect(fixtureTablesSchema.safeParse([parent, child]).success).toBe(false);
  expect(
    fixtureTablesSchema.safeParse([parent, { ...child, columns: parent.columns }]).success,
  ).toBe(true);
  const audit = { ...table("date"), table: "publication_audit" };
  expect(
    fixtureTablesSchema.safeParse([{ ...parent, insertAudit: { targetTable: audit.table } }, audit])
      .success,
  ).toBe(false);
  expect(
    fixtureTablesSchema.safeParse([
      { ...parent, insertAudit: { targetTable: audit.table } },
      { ...audit, columns: parent.columns },
    ]).success,
  ).toBe(true);
});
