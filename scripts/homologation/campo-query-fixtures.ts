import { z } from "zod";
import {
  fixtureTablesSchema,
  type PublicationFixtureTable,
} from "../../src/domain/persona-v2/publication-fixture.js";

export const campoQueryProfileSchema = z.enum([
  "titulos-pagar",
  "vencidos-pagar",
  "agenda-pagar",
  "saldo-fornecedor",
]);
export type CampoQueryProfile = z.infer<typeof campoQueryProfileSchema>;

/** Fixed synthetic schemas matching the curated cases, never inferred from an ERP. */
export function campoQueryTables(input: CampoQueryProfile): PublicationFixtureTable[] {
  const profile = campoQueryProfileSchema.parse(input);
  const supplier = profile === "titulos-pagar" || profile === "saldo-fornecedor";
  const keys = ["codempresa", "codcontapagar"];
  const fields: [string, "integer" | "string" | "decimal" | "date"][] = [
    ["codempresa", "integer"],
    ["codcontapagar", "integer"],
    ["codfilial", "integer"],
    ["moeda", "string"],
    ["saldopagar", "decimal"],
    ["status", "string"],
    ...(profile !== "saldo-fornecedor" ? [["datavencimento", "date"] as [string, "date"]] : []),
    ...(supplier ? [["codfornecedor", "integer"] as [string, "integer"]] : []),
    ...(profile === "titulos-pagar"
      ? ([
          ["numerotitulo", "string"],
          ["parcela", "string"],
        ] as [string, "string"][])
      : []),
  ];
  return fixtureTablesSchema.parse([
    {
      table: "dbo.contapagar",
      primaryKey: keys,
      columns: fields.map(([name, type]) => ({ name, type, nullable: !keys.includes(name) })),
    },
    ...(supplier
      ? [
          {
            table: "dbo.fornecedor",
            primaryKey: ["codfornecedor"],
            columns: [
              { name: "codfornecedor", type: "integer" },
              { name: "razaosocial", type: "string", nullable: true },
            ],
          },
        ]
      : []),
  ]);
}
