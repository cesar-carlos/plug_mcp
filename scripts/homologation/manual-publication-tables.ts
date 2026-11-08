import {
  fixtureTablesSchema,
  type PublicationFixtureTable,
} from "../../src/domain/persona-v2/publication-fixture.js";

/** Typed, synthetic tables only; no setup SQL or operational data. */
export function manualPublicationTables(
  dialect: string,
  campoPrazos = false,
): PublicationFixtureTable[] {
  return fixtureTablesSchema.parse([
    {
      table: "publication_orders",
      columns: [
        { name: "id", type: "integer" },
        { name: "marker", type: "string", nullable: true },
        { name: "revision", type: "integer" },
      ],
      primaryKey: ["id"],
    },
    ...(campoPrazos && dialect === "mssql"
      ? ["receber", "pagar"].map((side) => ({
          table: "dbo.conta" + side,
          columns: [
            { name: "codempresa", type: "integer" },
            { name: "codconta" + side, type: "integer" },
            { name: "moeda", type: "string", nullable: true },
            { name: "status", type: "string" },
            { name: "saldo" + side, type: "decimal", nullable: true },
            { name: "dataemissao", type: "date", nullable: true },
            { name: "datavencimento", type: "date", nullable: true },
          ],
          primaryKey: ["codempresa", "codconta" + side],
        }))
      : []),
  ]);
}
