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
it.each(["titulos-pagar", "vencidos-pagar", "agenda-pagar", "saldo-fornecedor"])(
  "perfil %s contém exatamente o contrato dos casos",
  (input) => {
    const profile = campoQueryProfileSchema.parse(input);
    const tables = campoQueryTables(campoQueryProfileSchema.parse(profile));
    const supplier = profile === "titulos-pagar" || profile === "saldo-fornecedor";
    expect(tables.map((t) => t.table)).toEqual(
      supplier ? ["dbo.contapagar", "dbo.fornecedor"] : ["dbo.contapagar"],
    );
    const expected = {
      ...common,
      ...(profile !== "saldo-fornecedor" ? { datavencimento: "date" } : {}),
      ...(supplier ? { codfornecedor: "integer" } : {}),
      ...(profile === "cobranca-cliente" ? { codcliente: "integer" } : {}),
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
    expect(
      manualPublicationTables("mssql", false, undefined, campoQueryProfileSchema.parse(profile)),
    ).toEqual(tables);
    for (const dialect of ["postgres", "sybase"])
      expect(manualPublicationTables(dialect, false, undefined, profile)).toEqual(
        manualPublicationTables(dialect),
      );
    expect(() => manualPublicationTables("mssql", true, undefined, profile)).toThrow();
    expect(() =>
      manualPublicationTables("mssql", false, "pagar", campoQueryProfileSchema.parse(profile)),
    ).toThrow();
  },
);
it("recusa perfil fora do contrato fechado", () => {
  expect(campoQueryProfileSchema.safeParse("erp").success).toBe(false);
});

it.each([
  { profile: "horizonte-pagar", side: "pagar", supplier: false },
  { profile: "horizonte-receber", side: "receber", supplier: false },
  { profile: "atraso-fornecedor", side: "pagar", supplier: true },
  { profile: "cobranca-cliente", side: "receber", supplier: false },
])(
  "perfil $profile isola exatamente o contrato financeiro",
  ({ profile: input, side, supplier }) => {
    const profile = campoQueryProfileSchema.parse(input);
    const tables = campoQueryTables(campoQueryProfileSchema.parse(profile));
    expect(tables).toHaveLength(1);
    const table = tables[0]!;
    expect(table.table).toBe("dbo.conta" + side);
    expect(table.primaryKey).toEqual(["codempresa", "codconta" + side]);
    expect(Object.fromEntries(table.columns.map((c) => [c.name, c.type]))).toEqual({
      codempresa: "integer",
      ["codconta" + side]: "integer",
      codfilial: "integer",
      moeda: "string",
      ["saldo" + side]: "decimal",
      status: "string",
      datavencimento: "date",
      ...(profile === "cobranca-cliente" ? { codcliente: "integer" } : {}),
      ...(supplier ? { codfornecedor: "integer" } : {}),
    });
    expect(table.columns.filter((c) => !c.nullable).map((c) => c.name)).toEqual(table.primaryKey);
    expect(table.foreignKeys).toEqual([]);
    expect(table.uniqueKeys).toEqual([]);
    expect(table.columns.some((c) => c.generated)).toBe(false);
    expect(manualPublicationTables("mssql", false, undefined, profile)).toEqual(tables);
    expect(manualPublicationTables("postgres", false, undefined, profile)).toEqual(
      manualPublicationTables("postgres"),
    );
    expect(manualPublicationTables("sybase", false, undefined, profile)).toEqual(
      manualPublicationTables("sybase"),
    );
    expect(() => manualPublicationTables("mssql", true, undefined, profile)).toThrow();
    expect(() =>
      manualPublicationTables("mssql", false, "receber", campoQueryProfileSchema.parse(profile)),
    ).toThrow();
  },
);

it("titulos-receber declares only the base sample fields in isolated MSSQL", () => {
  const tables = campoQueryTables("titulos-receber");
  expect(tables.map((t) => t.table)).toEqual(["dbo.contareceber", "dbo.cliente"]);
  expect(Object.fromEntries(tables[0]!.columns.map((c) => [c.name, c.type]))).toEqual({
    codempresa: "integer",
    codcontareceber: "integer",
    codfilial: "integer",
    codcliente: "integer",
    moeda: "string",
    status: "string",
    numerotitulo: "string",
    parcela: "string",
    saldoreceber: "decimal",
    datavencimento: "date",
  });
  expect(tables[0]!.primaryKey).toEqual(["codempresa", "codcontareceber"]);
  expect(tables[1]!.primaryKey).toEqual(["codcliente"]);
  expect(Object.fromEntries(tables[1]!.columns.map((c) => [c.name, c.type]))).toEqual({
    codcliente: "integer",
    nome: "string",
  });
  for (const t of tables) {
    expect(t.columns.filter((c) => !c.nullable).map((c) => c.name)).toEqual(t.primaryKey);
    expect(t.columns.some((c) => c.generated)).toBe(false);
    expect(t.foreignKeys).toEqual([]);
    expect(t.uniqueKeys).toEqual([]);
  }
  expect(manualPublicationTables("mssql", false, undefined, "titulos-receber")).toEqual(tables);
  for (const engine of ["postgres", "sybase"])
    expect(manualPublicationTables(engine, false, undefined, "titulos-receber")).toEqual(
      manualPublicationTables(engine),
    );
  expect(() => manualPublicationTables("mssql", true, undefined, "titulos-receber")).toThrow();
  expect(() => manualPublicationTables("mssql", false, "receber", "titulos-receber")).toThrow();
});
