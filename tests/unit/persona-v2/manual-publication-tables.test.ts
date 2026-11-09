import { expect, it } from "vitest";
import { manualPublicationTables } from "../../../scripts/homologation/manual-publication-tables.js";

it.each(["pagar", "receber"] as const)("perfil %s conserva somente a tabela do caso", (side) => {
  const tables = manualPublicationTables("mssql", false, side);
  expect(tables.map((table) => table.table)).toEqual([`dbo.conta${side}`]);
  expect(tables).toEqual(
    manualPublicationTables("mssql", true).filter((t) => t.table === `dbo.conta${side}`),
  );
  expect(manualPublicationTables("postgres", false, side)).toEqual(
    manualPublicationTables("postgres"),
  );
  expect(manualPublicationTables("sybase", false, side)).toEqual(manualPublicationTables("sybase"));
  expect(() => manualPublicationTables("mssql", true, side)).toThrow("único perfil");
});

it.each(["mssql", "postgres", "sybase"])("fixture padrão permanece mínima em %s", (dialect) => {
  expect(manualPublicationTables(dialect).map((table) => table.table)).toEqual([
    "publication_orders",
  ]);
});

it.each(["postgres", "sybase"])("opção MSSQL não altera fixture %s", (dialect) => {
  expect(manualPublicationTables(dialect, true)).toEqual(manualPublicationTables(dialect));
});

it("fixture opcional tem chaves compostas e tipos de prazos sem dados operacionais", () => {
  const tables = manualPublicationTables("mssql", true);
  expect(tables.map((table) => table.table)).toEqual([
    "publication_orders",
    "dbo.contareceber",
    "dbo.contapagar",
  ]);
  for (const [index, side] of ["receber", "pagar"].entries()) {
    const table = tables[index + 1]!;
    expect(table.primaryKey).toEqual(["codempresa", "codconta" + side]);
    expect(table.columns.filter((column) => table.primaryKey.includes(column.name))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "codempresa", type: "integer", nullable: false }),
        expect.objectContaining({ name: "codconta" + side, type: "integer", nullable: false }),
      ]),
    );
    expect(table.columns).toContainEqual(
      expect.objectContaining({ name: "saldo" + side, type: "decimal" }),
    );
    expect(
      table.columns.filter((column) => column.type === "date").map((column) => column.name),
    ).toEqual(["dataemissao", "datavencimento"]);
    expect(table).not.toHaveProperty("rows");
    expect(table).not.toHaveProperty("sql");
  }
  tables[0]!.columns.length = 0;
  expect(manualPublicationTables("mssql")[0]!.columns).toHaveLength(3);
});
