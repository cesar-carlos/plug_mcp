import { z } from "zod";
import { campoSalesTables } from "./campo-sales-fixtures.js";
import {
  fixtureTablesSchema,
  type PublicationFixtureTable,
} from "../../src/domain/persona-v2/publication-fixture.js";

export const campoQueryProfileSchema = z.enum([
  "agenda-receber-pagar",
  "titulos-receber",
  "titulos-pagar",
  "vencidos-pagar",
  "agenda-pagar",
  "saldo-fornecedor",
  "horizonte-pagar",
  "horizonte-receber",
  "atraso-fornecedor",
  "cobranca-cliente",
  "vendas-resumo",
  "vendas-vendedor",
  "vendas-descontos",
  "vendas-municipio",
]);
export type CampoQueryProfile = z.infer<typeof campoQueryProfileSchema>;

/** Fixed synthetic schemas matching the curated cases, never inferred from an ERP. */
export function campoQueryTables(input: CampoQueryProfile): PublicationFixtureTable[] {
  const profile = campoQueryProfileSchema.parse(input);
  if (profile === "agenda-receber-pagar") {
    return [...campoQueryTables("horizonte-receber"), ...campoQueryTables("horizonte-pagar")];
  }
  if (
    profile === "vendas-resumo" ||
    profile === "vendas-vendedor" ||
    profile === "vendas-descontos" ||
    profile === "vendas-municipio"
  )
    return campoSalesTables(profile);
  if (
    profile === "horizonte-pagar" ||
    profile === "horizonte-receber" ||
    profile === "atraso-fornecedor" ||
    profile === "cobranca-cliente"
  ) {
    const side = ["horizonte-receber", "cobranca-cliente"].includes(profile) ? "receber" : "pagar";
    const primaryKey = ["codempresa", "codconta" + side];
    const fields: [string, "integer" | "string" | "decimal" | "date"][] = [
      ["codempresa", "integer"],
      ["codconta" + side, "integer"],
      ["codfilial", "integer"],
      ["moeda", "string"],
      ["saldo" + side, "decimal"],
      ["status", "string"],
      ["datavencimento", "date"],
      ...(profile === "cobranca-cliente" ? [["codcliente", "integer"] as [string, "integer"]] : []),
      ...(profile === "atraso-fornecedor"
        ? [["codfornecedor", "integer"] as [string, "integer"]]
        : []),
    ];
    return fixtureTablesSchema.parse([
      {
        table: "dbo.conta" + side,
        primaryKey,
        columns: fields.map(([name, type]) => ({
          name,
          type,
          nullable: !primaryKey.includes(name),
        })),
      },
    ]);
  }
  if (profile === "titulos-receber") {
    const primaryKey = ["codempresa", "codcontareceber"];
    const fields: [string, "integer" | "string" | "decimal" | "date"][] = [
      ["codempresa", "integer"],
      ["codcontareceber", "integer"],
      ["codfilial", "integer"],
      ["codcliente", "integer"],
      ["moeda", "string"],
      ["status", "string"],
      ["numerotitulo", "string"],
      ["parcela", "string"],
      ["saldoreceber", "decimal"],
      ["datavencimento", "date"],
    ];
    return fixtureTablesSchema.parse([
      {
        table: "dbo.contareceber",
        primaryKey,
        columns: fields.map(([name, type]) => ({
          name,
          type,
          nullable: !primaryKey.includes(name),
        })),
      },
      {
        table: "dbo.cliente",
        primaryKey: ["codcliente"],
        columns: [
          { name: "codcliente", type: "integer" },
          { name: "nome", type: "string", nullable: true },
        ],
      },
    ]);
  }
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
