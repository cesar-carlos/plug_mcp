import { expect, it } from "vitest";
import { campoQueryTables } from "../../../scripts/homologation/campo-query-fixtures.js";
import { campoFinanceItemCandidates } from "../../../scripts/homologation/campo-finance-item-candidates.js";
import { manualPublicationTables } from "../../../scripts/homologation/manual-publication-tables.js";

it.each(["pagamentos-efetivos", "pontualidade-recebimentos", "itens-detalhados"] as const)(
  "%s mantém isolamento e timestamps",
  (profile) => {
    const tables = campoQueryTables(profile);
    expect(manualPublicationTables("mssql", false, undefined, profile)).toEqual(tables);
    expect(() => manualPublicationTables("mssql", true, undefined, profile)).toThrow();
    for (const dialect of ["postgres", "sybase"])
      expect(manualPublicationTables(dialect, false, undefined, profile)).toEqual(
        manualPublicationTables(dialect),
      );
    for (const t of tables) {
      expect(t.foreignKeys).toEqual([]);
      expect(t).not.toHaveProperty("rows");
      for (const c of t.columns.filter((c) => c.type === "date"))
        expect(c.temporalStorage).toBe("datetime2_3");
    }
  },
);
it("preserva PK composta das baixas e item textual sem converter perfil antigo", () => {
  expect(campoQueryTables("pagamentos-efetivos")[0]!.primaryKey).toEqual([
    "codempresa",
    "codpagamento",
    "codcontapagar",
  ]);
  expect(campoQueryTables("pontualidade-recebimentos")[0]!.primaryKey).toEqual([
    "codempresa",
    "codrecebimento",
    "codcontareceber",
  ]);
  expect(
    campoQueryTables("itens-detalhados")[0]!.columns.find((c) => c.name === "itemprodutovendido")!
      .type,
  ).toBe("string");
  expect(
    campoQueryTables("itens-gestao")[0]!.columns.find((c) => c.name === "itemprodutovendido")!.type,
  ).toBe("integer");
});
it("candidatos têm sementes coerentes com tipos, PKs únicas e expectativas sem status de aprovação", () => {
  const cases = campoFinanceItemCandidates();
  const groups = [
    { profile: "pagamentos-efetivos", cases: cases.payments },
    { profile: "pontualidade-recebimentos", cases: [cases.receipts] },
    { profile: "itens-detalhados", cases: [cases.discounts, cases.promotions, cases.taxes] },
  ] as const;
  for (const group of groups)
    for (const c of group.cases) {
      expect(c).not.toHaveProperty("approved");
      expect(c.input.sql).toBeUndefined();
      const tables = campoQueryTables(group.profile);
      for (const seed of c.input.fixtures) {
        const t = tables.find((t) => t.table === seed.table)!;
        const keys = new Set();
        for (const row of seed.rows) {
          const key = JSON.stringify(t.primaryKey.map((k) => row[k]));
          expect(keys.has(key)).toBe(false);
          keys.add(key);
          for (const col of t.columns) {
            const cell = row[col.name]!;
            expect(cell).toBeDefined();
            if (t.primaryKey.includes(col.name)) expect(cell.type).not.toBe("null");
            expect([col.type, "null"]).toContain(cell.type);
          }
        }
      }
    }
});
it("casos preservam parciais, extremos temporais, nulos e denominadores", () => {
  const c = campoFinanceItemCandidates();
  expect(c.payments[0]!.expected.rows[0]!.valorliquidopago).toEqual({
    type: "decimal",
    value: "16.00",
  });
  expect(c.payments[1]!.expected.rows[0]!.valorliquidopago).toEqual({ type: "null", value: null });
  const rows = c.payments[0]!.input.fixtures[0]!.rows;
  expect(rows[0]!.codcontapagar).toEqual(rows[1]!.codcontapagar);
  expect(rows[0]!.codpagamento).not.toEqual(rows[1]!.codpagamento);
  expect(rows[1]!.datapagamento).toEqual({ type: "date", value: "2030-01-01T23:59:59.997Z" });
  expect(rows[2]!.datapagamento).toEqual({ type: "date", value: "2030-01-02T00:00:00.000Z" });
  expect(c.receipts.expected.rows[0]!.percentualbaixasnoprazo).toEqual({
    type: "decimal",
    value: "50",
  });
  expect(c.receipts.expected.rows[0]!.percentualvalornoprazo).toEqual({
    type: "decimal",
    value: "30",
  });
  expect(c.discounts.expected.rows[0]!.frequenciapercentual).toEqual({
    type: "decimal",
    value: "50",
  });
  expect(c.taxes.expected.rows[0]!.itemprodutovendido).toEqual({ type: "string", value: "01" });
  expect(c.taxes.expected.rows[0]!.valorpis).toEqual({ type: "decimal", value: "0.15" });
});
