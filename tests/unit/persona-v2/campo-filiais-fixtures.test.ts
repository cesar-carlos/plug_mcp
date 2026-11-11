import { expect, it } from "vitest";
import { campoQueryTables } from "../../../scripts/homologation/campo-query-fixtures.js";
import { manualPublicationTables } from "../../../scripts/homologation/manual-publication-tables.js";
it("cadastro filiais mantém grão composto, vínculo anulável e só a amostra em MSSQL", () => {
  const tables = campoQueryTables("cadastro-filiais");
  expect(tables.map((t) => t.table)).toEqual(["dbo.filial", "dbo.municipio"]);
  expect(tables.map((t) => t.columns.length)).toEqual([13, 3]);
  expect(tables[0]!.primaryKey).toEqual(["codempresa", "codfilial"]);
  expect(tables[1]!.primaryKey).toEqual(["codmunicipio"]);
  expect(tables[0]!.columns.find((c) => c.name === "codmunicipio")).toMatchObject({
    type: "integer",
    nullable: true,
  });
  expect(tables.every((t) => t.foreignKeys.length === 0 && !Object.hasOwn(t, "rows"))).toBe(true);
  expect(manualPublicationTables("mssql", false, undefined, "cadastro-filiais")).toEqual(tables);
  for (const engine of ["postgres", "sybase"]) {
    expect(manualPublicationTables(engine, false, undefined, "cadastro-filiais")).toEqual(
      manualPublicationTables(engine),
    );
  }
  expect(() => manualPublicationTables("mssql", true, undefined, "cadastro-filiais")).toThrow(
    "único perfil",
  );
  tables[0]!.columns.length = 0;
  expect(campoQueryTables("cadastro-filiais")[0]!.columns).toHaveLength(13);
});
