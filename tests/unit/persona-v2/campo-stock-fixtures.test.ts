import { expect, it } from "vitest";
import { campoQueryTables } from "../../../scripts/homologation/campo-query-fixtures.js";
import { manualPublicationTables } from "../../../scripts/homologation/manual-publication-tables.js";
it.each(["estoque-locais", "estoque-saldos"] as const)(
  "perfil %s isola estoque sem inferir FK/filial",
  (profile) => {
    const tables = campoQueryTables(profile);
    expect(tables.map((t) => t.table)).toEqual(
      profile === "estoque-locais"
        ? ["dbo.localarmazenagem", "dbo.localarmazenagemfilial"]
        : [
            "dbo.localarmazenagem",
            "dbo.saldoestoque",
            "dbo.produto",
            "dbo.marca",
            "dbo.grupoproduto",
          ],
    );
    expect(tables.every((t) => t.foreignKeys.length === 0 && !Object.hasOwn(t, "rows"))).toBe(true);
    if (profile === "estoque-locais")
      expect(tables.find((t) => t.table === "dbo.localarmazenagemfilial")!.primaryKey).toEqual([
        "codempresa",
        "codfilial",
        "codlocalarmazenagem",
      ]);
    expect(tables.some((t) => t.table === "dbo.filial")).toBe(false);
    expect(manualPublicationTables("mssql", false, undefined, profile)).toEqual(tables);
    for (const engine of ["postgres", "sybase"])
      expect(manualPublicationTables(engine, false, undefined, profile)).toEqual(
        manualPublicationTables(engine),
      );
    expect(() => manualPublicationTables("mssql", true, undefined, profile)).toThrow(
      "único perfil",
    );
  },
);
