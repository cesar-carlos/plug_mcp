import { expect, it } from "vitest";
import { campoQueryTables } from "../../../scripts/homologation/campo-query-fixtures.js";
import { manualPublicationTables } from "../../../scripts/homologation/manual-publication-tables.js";
it("estoque gerencial preserva grãos, nulos e isolamento sem vínculo inferido", () => {
  const t = campoQueryTables("estoque-gestao");
  expect(t.map((x) => x.table)).toEqual([
    "dbo.saldoestoque",
    "dbo.produto",
    "dbo.custoproduto",
    "dbo.produtovendido",
    "dbo.itemprodutovendido",
    "dbo.tipooperacaosaida",
  ]);
  expect(t.every((x) => x.foreignKeys.length === 0 && !Object.hasOwn(x, "rows"))).toBe(true);
  expect(t.find((x) => x.table === "dbo.saldoestoque")!.primaryKey).toEqual([
    "codlocalarmazenagem",
    "codproduto",
  ]);
  expect(t.find((x) => x.table === "dbo.custoproduto")!.primaryKey).toEqual([
    "codempresa",
    "codfilial",
    "codproduto",
  ]);
  expect(
    t.find((x) => x.table === "dbo.produtovendido")!.columns.find((x) => x.name === "datavenda")!
      .nullable,
  ).toBe(true);
  expect(manualPublicationTables("mssql", false, undefined, "estoque-gestao")).toEqual(t);
  for (const engine of ["postgres", "sybase"])
    expect(manualPublicationTables(engine, false, undefined, "estoque-gestao")).toEqual(
      manualPublicationTables(engine),
    );
  expect(() => manualPublicationTables("mssql", true, undefined, "estoque-gestao")).toThrow(
    "único perfil",
  );
});
