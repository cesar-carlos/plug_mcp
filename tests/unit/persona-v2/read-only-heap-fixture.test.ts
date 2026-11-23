import { expect, it } from "vitest";
import {
  fixtureTablesSchema,
  fixtureSeedsSchema,
} from "../../../src/domain/persona-v2/publication-fixture.js";
import {
  campoQueryTables,
  campoQueryProfileSchema,
} from "../../../scripts/homologation/campo-query-fixtures.js";
import { caseRowsEqual } from "../../../src/application/persona-v2/publication-case-values.js";
import { manualPublicationTables } from "../../../scripts/homologation/manual-publication-tables.js";

const heap = {
  table: "dbo.parcelaprodutovendido",
  primaryKey: [],
  readOnlyHeap: true,
  columns: [
    { name: "codempresa", type: "integer" },
    { name: "codprodutovendido", type: "integer" },
    { name: "gerafinanceiro", type: "string", nullable: true },
  ],
};
it("opt-in de parcelas preserva outros motores e exige perfil compatível", () => {
  expect(
    manualPublicationTables("mssql", false, undefined, "vendas-resumo", true).at(-1),
  ).toMatchObject(heap);
  for (const dialect of ["postgres", "sybase"])
    expect(manualPublicationTables(dialect, false, undefined, "vendas-resumo", true)).toEqual(
      manualPublicationTables(dialect),
    );
  expect(() => manualPublicationTables("mssql", false, undefined, undefined, true)).toThrow();
  expect(() =>
    manualPublicationTables("mssql", false, undefined, "estoque-locais", true),
  ).toThrow();
});
it("heap exige opt-in explícito e não inventa chave", () => {
  expect(fixtureTablesSchema.parse([heap])[0]).toMatchObject({
    primaryKey: [],
    readOnlyHeap: true,
    uniqueKeys: [],
    foreignKeys: [],
  });
  const { readOnlyHeap: _, ...implicit } = heap;
  expect(fixtureTablesSchema.safeParse([implicit]).success).toBe(false);
  expect(fixtureTablesSchema.safeParse([{ ...heap, primaryKey: ["codempresa"] }]).success).toBe(
    false,
  );
});
it.each([
  { uniqueKeys: [["codempresa"]] },
  { insertAudit: { targetTable: "audit" } },
  { updateAudit: { targetTable: "audit" } },
  { deleteAudit: { targetTable: "audit" } },
  { checks: [{ kind: "integer_range", column: "codempresa", min: "1", max: "9" }] },
  { columns: [{ name: "id", type: "integer", generated: true }] },
])("heap não concede constraints ou efeitos: %j", (extra) => {
  expect(fixtureTablesSchema.safeParse([{ ...heap, ...extra }]).success).toBe(false);
});
it("heap não é alvo de FK nem de trigger", () => {
  const child = { table: "child", primaryKey: ["codempresa"], columns: heap.columns };
  expect(
    fixtureTablesSchema.safeParse([
      heap,
      {
        ...child,
        foreignKeys: [
          { columns: ["codempresa"], targetTable: heap.table, targetColumns: ["codempresa"] },
        ],
      },
    ]).success,
  ).toBe(false);
  expect(
    fixtureTablesSchema.safeParse([heap, { ...child, insertAudit: { targetTable: heap.table } }])
      .success,
  ).toBe(false);
});
it.each(campoQueryProfileSchema.options)(
  "%s acrescenta parcelas somente quando usa vendas",
  (profile) => {
    const tables = campoQueryTables(profile);
    const hasSales = tables.some((t) => t.table === "dbo.produtovendido");
    expect(tables.some((t) => t.table === heap.table)).toBe(false);
    if (!hasSales) {
      expect(() => campoQueryTables(profile, true)).toThrow();
      return;
    }
    const extended = campoQueryTables(profile, true);
    expect(extended.slice(0, -1)).toEqual(tables);
    expect(extended.filter((t) => t.table === heap.table)).toHaveLength(1);
    expect(extended.at(-1)).toMatchObject(heap);
  },
);
it("seeds e comparação preservam multiplicidade e null sem deduplicação", () => {
  const row = {
    codempresa: { type: "integer", value: "1" },
    codprodutovendido: { type: "integer", value: "1" },
    gerafinanceiro: { type: "null", value: null },
  };
  const seeds = fixtureSeedsSchema.parse([{ table: heap.table, rows: [row, row] }]);
  expect(seeds[0]!.rows).toHaveLength(2);
  const columns = fixtureTablesSchema.parse([heap])[0]!.columns;
  const returned = { codempresa: 1, codprodutovendido: 1, gerafinanceiro: null };
  expect(caseRowsEqual([returned, returned], seeds[0]!.rows, columns, false)).toBe(true);
  expect(caseRowsEqual([returned], seeds[0]!.rows, columns, false)).toBe(false);
});
