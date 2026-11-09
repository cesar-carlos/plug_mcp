import { expect, it } from "vitest";
import {
  campoQueryTables,
  campoQueryProfileSchema,
} from "../../../scripts/homologation/campo-query-fixtures.js";
import { manualPublicationTables } from "../../../scripts/homologation/manual-publication-tables.js";
it.each(["vendas-resumo", "vendas-vendedor", "vendas-municipio", "vendas-descontos"])(
  "perfil %s limita campos e preserva isolamento",
  (input) => {
    const seller = input === "vendas-vendedor" || input === "vendas-descontos";
    const profile = campoQueryProfileSchema.parse(input);
    const tables = campoQueryTables(profile);
    expect(tables.map((t) => t.table)).toEqual([
      "dbo.produtovendido",
      "dbo.tipooperacaosaida",
      ...(input === "vendas-resumo" ? [] : [seller ? "dbo.vendedor" : "dbo.municipio"]),
    ]);
    expect(tables[0]!.primaryKey).toEqual(["codempresa", "codprodutovendido"]);
    expect(tables[1]!.primaryKey).toEqual(["codempresa", "codtipooperacaosaida"]);
    expect(tables[0]!.columns.map((c) => c.name)).toEqual([
      "codempresa",
      "codfilial",
      "codprodutovendido",
      "codtipooperacaosaida",
      "datavenda",
      "prevenda",
      ...(input === "vendas-descontos" ? ["valorbruto", "valordesconto"] : ["valorliquido"]),
      ...(input === "vendas-resumo" ? [] : [seller ? "codvendedor" : "codmunicipio"]),
    ]);
    for (const name of ["valorbruto", "valordesconto"]) {
      const column = tables[0]!.columns.find((c) => c.name === name);
      if (input === "vendas-descontos") {
        expect(column).toMatchObject({ type: "decimal", nullable: true, generated: false });
      } else {
        expect(column).toBeUndefined();
      }
    }
    expect(tables[0]!.columns.find((c) => c.name === "valorliquido")?.type).toBe(
      input === "vendas-descontos" ? undefined : "decimal",
    );
    expect(tables[0]!.columns.find((c) => c.name === "datavenda")?.type).toBe("date");
    for (const table of tables) {
      expect(table.foreignKeys).toEqual([]);
      expect(table.uniqueKeys).toEqual([]);
      expect(
        table.columns
          .filter((c) => !c.nullable)
          .map((c) => c.name)
          .sort(),
      ).toEqual([...table.primaryKey].sort());
      expect(table.columns.some((c) => c.generated)).toBe(false);
    }
    expect(manualPublicationTables("mssql", false, undefined, profile)).toEqual(tables);
    for (const engine of ["postgres", "sybase"])
      expect(manualPublicationTables(engine, false, undefined, profile)).toEqual(
        manualPublicationTables(engine),
      );
    expect(() => manualPublicationTables("mssql", true, undefined, profile)).toThrow();
    expect(() => manualPublicationTables("mssql", false, "pagar", profile)).toThrow();
  },
);

it("clientes usa somente cabeçalho e operação, consolidando filiais sem dados pessoais extras", () => {
  const tables = campoQueryTables("vendas-clientes");
  expect(tables.map((t) => t.table)).toEqual(["dbo.produtovendido", "dbo.tipooperacaosaida"]);
  expect(tables[0]!.columns.map((c) => c.name)).toEqual([
    "codempresa",
    "codfilial",
    "codprodutovendido",
    "codtipooperacaosaida",
    "datavenda",
    "prevenda",
    "valorliquido",
    "codcliente",
  ]);
  expect(tables[0]!.columns.find((c) => c.name === "codcliente")).toMatchObject({
    type: "integer",
    nullable: true,
  });
  expect(tables[0]!.primaryKey).toEqual(["codempresa", "codprodutovendido"]);
  expect(tables.every((t) => t.foreignKeys.length === 0)).toBe(true);
  expect(manualPublicationTables("mssql", false, undefined, "vendas-clientes")).toEqual(tables);
  expect(manualPublicationTables("postgres", false, undefined, "vendas-clientes")).toEqual(
    manualPublicationTables("postgres"),
  );
  expect(() => manualPublicationTables("mssql", true, undefined, "vendas-clientes")).toThrow();
});

it("distribuições preservam cabeçalho sem depender de cadastros e sem FK inferida", () => {
  const tables = campoQueryTables("vendas-distribuicoes");
  expect(tables.map((t) => t.table)).toEqual(["dbo.produtovendido", "dbo.tipooperacaosaida"]);
  expect(tables[0]!.columns.map((c) => c.name)).toEqual([
    "codempresa",
    "codfilial",
    "codprodutovendido",
    "codtipooperacaosaida",
    "datavenda",
    "prevenda",
    "valorliquido",
    "codcondicaopagamento",
    "codfornecedor",
    "valorfrete",
    "codvendedor",
    "codcliente",
  ]);
  expect(tables[0]!.columns.find((c) => c.name === "valorfrete")).toMatchObject({
    type: "decimal",
    nullable: true,
  });
  expect(tables.every((t) => t.foreignKeys.length === 0)).toBe(true);
  expect(manualPublicationTables("mssql", false, undefined, "vendas-distribuicoes")).toEqual(
    tables,
  );
  expect(manualPublicationTables("postgres", false, undefined, "vendas-distribuicoes")).toEqual(
    manualPublicationTables("postgres"),
  );
  expect(() => manualPublicationTables("mssql", true, undefined, "vendas-distribuicoes")).toThrow();
});

it("cestas usam chave de item composta e preservam unidade e valores desconhecidos", () => {
  const tables = campoQueryTables("itens-cestas");
  expect(tables.map((t) => t.table)).toEqual([
    "dbo.produtovendido",
    "dbo.tipooperacaosaida",
    "dbo.itemprodutovendido",
  ]);
  expect(tables[0]!.columns.map((c) => c.name)).toEqual([
    "codempresa",
    "codfilial",
    "codprodutovendido",
    "codtipooperacaosaida",
    "datavenda",
    "prevenda",
  ]);
  expect(tables[2]!.primaryKey).toEqual(["codempresa", "codprodutovendido", "itemprodutovendido"]);
  expect(tables[2]!.columns.find((c) => c.name === "codunidademedida")).toMatchObject({
    type: "string",
    nullable: true,
  });
  expect(tables[2]!.columns.find((c) => c.name === "quantidade")).toMatchObject({
    type: "decimal",
    nullable: true,
  });
  expect(tables.every((t) => t.foreignKeys.length === 0)).toBe(true);
  expect(manualPublicationTables("mssql", false, undefined, "itens-cestas")).toEqual(tables);
  expect(manualPublicationTables("postgres", false, undefined, "itens-cestas")).toEqual(
    manualPublicationTables("postgres"),
  );
  expect(() => manualPublicationTables("mssql", true, undefined, "itens-cestas")).toThrow();
});

it("custo atual usa somente a amostra e mantém nulos e isolamento", () => {
  const tables = campoQueryTables("custo-atual");
  expect(tables.map((t) => t.table)).toEqual([
    "dbo.custoproduto",
    "dbo.produto",
    "dbo.unidademedida",
    "dbo.grupoproduto",
    "dbo.marca",
  ]);
  expect(tables[0]!.primaryKey).toEqual(["codempresa", "codfilial", "codproduto"]);
  expect(tables[0]!.columns.map((c) => c.name)).toEqual([
    "codempresa",
    "codfilial",
    "codproduto",
    "custocompra",
    "customedioponderado",
    "ultimoprecocompra",
  ]);
  expect(tables[0]!.columns.filter((c) => c.type === "decimal").every((c) => c.nullable)).toBe(
    true,
  );
  expect(tables[1]!.columns.find((c) => c.name === "codunidademedida")).toMatchObject({
    type: "string",
    nullable: true,
  });
  expect(tables.reduce((n, t) => n + t.columns.length, 0)).toBe(17);
  expect(tables.every((t) => t.foreignKeys.length === 0)).toBe(true);
  expect(manualPublicationTables("mssql", false, undefined, "custo-atual")).toEqual(tables);
  expect(manualPublicationTables("postgres", false, undefined, "custo-atual")).toEqual(
    manualPublicationTables("postgres"),
  );
  expect(() => manualPublicationTables("mssql", true, undefined, "custo-atual")).toThrow();
});
