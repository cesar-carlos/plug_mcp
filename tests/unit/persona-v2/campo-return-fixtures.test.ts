import { expect, it } from "vitest";
import { campoQueryTables } from "../../../scripts/homologation/campo-query-fixtures.js";
import { manualPublicationTables } from "../../../scripts/homologation/manual-publication-tables.js";
it("preserva contrato mínimo de devoluções, chave textual e nulabilidade", () => {
  const tables = campoQueryTables("devolucoes-resumos");
  expect(tables.map((t) => [t.table, t.columns.length])).toEqual([
    ["dbo.itemdevolucaovenda", 8],
    ["dbo.devolucaovenda", 6],
    ["dbo.tipooperacaodevolucao", 2],
    ["dbo.unidademedida", 1],
  ]);
  expect(tables.map((t) => t.primaryKey)).toEqual([
    ["codempresa", "coddevolucaovenda", "itemdevolucaovenda"],
    ["codempresa", "coddevolucaovenda"],
    ["codempresa", "codtipooperacaodevolucao"],
    ["codunidademedida"],
  ]);
  expect(
    tables.map((t) => Object.fromEntries(t.columns.map((c) => [c.name, [c.type, c.nullable]]))),
  ).toEqual([
    {
      codempresa: ["integer", false],
      coddevolucaovenda: ["integer", false],
      itemdevolucaovenda: ["string", false],
      codproduto: ["integer", false],
      nomeproduto: ["string", false],
      codunidademedida: ["string", true],
      quantidade: ["decimal", false],
      valorunitario: ["decimal", false],
    },
    {
      codempresa: ["integer", false],
      coddevolucaovenda: ["integer", false],
      codtipooperacaodevolucao: ["integer", false],
      codfilial: ["integer", true],
      status: ["string", true],
      data: ["date", false],
    },
    { codempresa: ["integer", false], codtipooperacaodevolucao: ["integer", false] },
    { codunidademedida: ["string", false] },
  ]);
  expect(tables[1]!.columns.find((c) => c.name === "data")!.temporalStorage).toBe("datetime2_3");
  for (const t of tables) {
    expect(t.foreignKeys).toEqual([]);
    expect(t.uniqueKeys).toEqual([]);
    expect(t).not.toHaveProperty("rows");
  }
});
it("isola o perfil MSSQL e não compartilha mutações", () => {
  const profile = "devolucoes-resumos";
  expect(manualPublicationTables("mssql", false, undefined, profile)).toEqual(
    campoQueryTables(profile),
  );
  for (const dialect of ["postgres", "sybase"])
    expect(manualPublicationTables(dialect, false, undefined, profile)).toEqual(
      manualPublicationTables(dialect),
    );
  expect(() => manualPublicationTables("mssql", true, undefined, profile)).toThrow();
  campoQueryTables(profile)[0]!.columns.pop();
  expect(campoQueryTables(profile)[0]!.columns).toHaveLength(8);
});
