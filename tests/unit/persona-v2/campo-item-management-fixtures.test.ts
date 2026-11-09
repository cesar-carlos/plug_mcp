import { expect, it } from "vitest";
import { campoQueryTables } from "../../../scripts/homologation/campo-query-fixtures.js";
import { manualPublicationTables } from "../../../scripts/homologation/manual-publication-tables.js";

it("variedade e perdas usam somente três tabelas e dezessete campos", () => {
  const tables = campoQueryTables("itens-variedade-perdas");
  expect(tables.map((t) => [t.table, t.columns.map((c) => c.name)])).toEqual([
    [
      "dbo.itemprodutovendido",
      [
        "codempresa",
        "codprodutovendido",
        "itemprodutovendido",
        "codproduto",
        "quantidade",
        "valoritem",
        "custovenda",
      ],
    ],
    [
      "dbo.produtovendido",
      [
        "codempresa",
        "codfilial",
        "codprodutovendido",
        "codtipooperacaosaida",
        "datavenda",
        "prevenda",
        "codvendedor",
      ],
    ],
    ["dbo.tipooperacaosaida", ["codempresa", "codtipooperacaosaida", "gerafinanceiro"]],
  ]);
  expect(tables.every((t) => t.foreignKeys.length === 0)).toBe(true);
  expect(
    tables.every((t) => t.columns.every((c) => c.nullable === !t.primaryKey.includes(c.name))),
  ).toBe(true);
  expect(manualPublicationTables("mssql", false, undefined, "itens-variedade-perdas")).toEqual(
    tables,
  );
  for (const engine of ["postgres", "sybase"]) {
    expect(manualPublicationTables(engine, false, undefined, "itens-variedade-perdas")).toEqual(
      manualPublicationTables(engine),
    );
  }
});

it("gestão dos itens preserva exatamente as amostras e os dados incompletos", () => {
  const tables = campoQueryTables("itens-gestao");
  expect(tables.map((t) => t.table)).toEqual([
    "dbo.itemprodutovendido",
    "dbo.produtovendido",
    "dbo.tipooperacaosaida",
    "dbo.produto",
    "dbo.marca",
    "dbo.grupoproduto",
  ]);
  expect(tables.reduce((n, t) => n + t.columns.length, 0)).toBe(30);
  expect(tables[0]!.primaryKey).toEqual(["codempresa", "codprodutovendido", "itemprodutovendido"]);
  expect(tables[1]!.primaryKey).toEqual(["codempresa", "codprodutovendido"]);
  expect(tables[0]!.columns.find((c) => c.name === "custovenda")).toMatchObject({
    type: "decimal",
    nullable: true,
  });
  expect(tables[0]!.columns.find((c) => c.name === "codunidademedida")).toMatchObject({
    type: "string",
    nullable: true,
  });
  expect(tables[1]!.columns.find((c) => c.name === "datavenda")).toMatchObject({
    type: "date",
    nullable: true,
  });
  expect(tables[1]!.columns.find((c) => c.name === "codvendedor")).toMatchObject({
    type: "integer",
    nullable: true,
  });
  expect(tables[3]!.columns.map((c) => c.name)).toEqual([
    "codproduto",
    "codmarca",
    "codgrupoproduto",
    "nome",
  ]);
  expect(tables.every((t) => t.foreignKeys.length === 0)).toBe(true);
  expect(manualPublicationTables("mssql", false, undefined, "itens-gestao")).toEqual(tables);
  for (const engine of ["postgres", "sybase"]) {
    expect(manualPublicationTables(engine, false, undefined, "itens-gestao")).toEqual(
      manualPublicationTables(engine),
    );
  }
  expect(() => manualPublicationTables("mssql", true, undefined, "itens-gestao")).toThrow();
  expect(() => manualPublicationTables("mssql", false, "pagar", "itens-gestao")).toThrow();
});
