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
