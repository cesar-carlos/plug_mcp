import { expect, it } from "vitest";
import {
  campoQueryTables,
  campoQueryProfileSchema,
} from "../../../scripts/homologation/campo-query-fixtures.js";
import { manualPublicationTables } from "../../../scripts/homologation/manual-publication-tables.js";

const common = {
  codempresa: "integer",
  codcontapagar: "integer",
  codfilial: "integer",
  moeda: "string",
  saldopagar: "decimal",
  status: "string",
};
it.each(campoQueryProfileSchema.options)(
  "perfil %s contém exatamente o contrato dos casos",
  (profile) => {
    const tables = campoQueryTables(profile);
    const supplier = profile === "titulos-pagar" || profile === "saldo-fornecedor";
    expect(tables.map((t) => t.table)).toEqual(
      supplier ? ["dbo.contapagar", "dbo.fornecedor"] : ["dbo.contapagar"],
    );
    const expected = {
      ...common,
      ...(profile !== "saldo-fornecedor" ? { datavencimento: "date" } : {}),
      ...(supplier ? { codfornecedor: "integer" } : {}),
      ...(profile === "titulos-pagar" ? { numerotitulo: "string", parcela: "string" } : {}),
    };
    expect(Object.fromEntries(tables[0]!.columns.map((c) => [c.name, c.type]))).toEqual(expected);
    expect(tables[0]!.primaryKey).toEqual(["codempresa", "codcontapagar"]);
    if (supplier) {
      expect(Object.fromEntries(tables[1]!.columns.map((c) => [c.name, c.type]))).toEqual({
        codfornecedor: "integer",
        razaosocial: "string",
      });
      expect(tables[1]!.primaryKey).toEqual(["codfornecedor"]);
    }
    for (const table of tables) {
      expect(table.foreignKeys).toEqual([]);
      expect(table.columns.filter((c) => c.generated)).toEqual([]);
    }
    expect(manualPublicationTables("mssql", false, undefined, profile)).toEqual(tables);
    for (const dialect of ["postgres", "sybase"])
      expect(manualPublicationTables(dialect, false, undefined, profile)).toEqual(
        manualPublicationTables(dialect),
      );
    expect(() => manualPublicationTables("mssql", true, undefined, profile)).toThrow();
    expect(() => manualPublicationTables("mssql", false, "pagar", profile)).toThrow();
  },
);
it("recusa perfil fora do contrato fechado", () => {
  expect(campoQueryProfileSchema.safeParse("erp").success).toBe(false);
});
