import { expect, it } from "vitest";
import {
  campoQueryTables,
  type CampoQueryProfile,
} from "../../../scripts/homologation/campo-query-fixtures.js";
import { manualPublicationTables } from "../../../scripts/homologation/manual-publication-tables.js";

it.each(["receber", "pagar"] as const)(
  "prazo por filial %s acrescenta apenas codfilial ao perfil original",
  (side) => {
    const profile = `prazo-filial-${side}` as CampoQueryProfile;
    const original = manualPublicationTables("mssql", false, side);
    const tables = campoQueryTables(profile);
    expect(tables).toHaveLength(1);
    const table = tables[0]!;
    expect(table.table).toBe(`dbo.conta${side}`);
    expect(table.columns).toHaveLength(8);
    expect(table.columns.find((c) => c.name === "codfilial")).toMatchObject({
      type: "integer",
      nullable: false,
      generated: false,
    });
    expect([{ ...table, columns: table.columns.filter((c) => c.name !== "codfilial") }]).toEqual(
      original,
    );
    expect(table.primaryKey).toEqual(["codempresa", `codconta${side}`]);
    expect(table.foreignKeys).toEqual([]);
    expect(table).not.toHaveProperty("rows");
    expect(table).not.toHaveProperty("sql");
    expect(manualPublicationTables("mssql", false, undefined, profile)).toEqual(tables);
    for (const engine of ["postgres", "sybase"]) {
      expect(manualPublicationTables(engine, false, undefined, profile)).toEqual(
        manualPublicationTables(engine),
      );
    }
    expect(() => manualPublicationTables("mssql", true, undefined, profile)).toThrow(
      "único perfil",
    );
    expect(() => manualPublicationTables("mssql", false, side, profile)).toThrow("único perfil");
    table.columns.length = 0;
    expect(campoQueryTables(profile)[0]!.columns).toHaveLength(8);
    expect(manualPublicationTables("mssql", false, side)).toEqual(original);
    expect(
      manualPublicationTables("mssql", true).find((t) => t.table === `dbo.conta${side}`),
    ).toEqual(original[0]);
  },
);
