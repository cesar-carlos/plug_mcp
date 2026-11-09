import {
  fixtureTablesSchema,
  type PublicationFixtureTable,
} from "../../src/domain/persona-v2/publication-fixture.js";
import { campoQueryTables, type CampoQueryProfile } from "./campo-query-fixtures.js";

/** Typed, synthetic tables only; no setup SQL or operational data. */
export function manualPublicationTables(
  dialect: string,
  campoPrazos = false,
  campoPrazo?: "pagar" | "receber",
  campoConsulta?: CampoQueryProfile,
): PublicationFixtureTable[] {
  if ([campoPrazos, !!campoPrazo, !!campoConsulta].filter(Boolean).length > 1)
    throw new Error("Escolha um único perfil de fixture de prazo.");
  if (campoConsulta) {
    const tables = campoQueryTables(campoConsulta);
    if (dialect === "mssql") return tables;
  }
  if (campoPrazo && (campoPrazos || !["pagar", "receber"].includes(campoPrazo)))
    throw new Error("Escolha um único perfil de fixture de prazo.");
  const sides = campoPrazo ? [campoPrazo] : ["receber", "pagar"];
  return fixtureTablesSchema.parse([
    ...(!campoPrazo || dialect !== "mssql"
      ? [
          {
            table: "publication_orders",
            columns: [
              { name: "id", type: "integer" },
              { name: "marker", type: "string", nullable: true },
              { name: "revision", type: "integer" },
            ],
            primaryKey: ["id"],
          },
        ]
      : []),
    ...((campoPrazos || campoPrazo) && dialect === "mssql"
      ? sides.map((side) => ({
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
