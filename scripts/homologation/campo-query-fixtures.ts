import { z } from "zod";
import { campoSalesTables } from "./campo-sales-fixtures.js";
import {
  fixtureTablesSchema,
  type PublicationFixtureTable,
} from "../../src/domain/persona-v2/publication-fixture.js";

export const campoQueryProfileSchema = z.enum([
  "estoque-locais",
  "estoque-saldos",
  "cadastro-filiais",
  "prazo-filial-receber",
  "prazo-filial-pagar",
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
  "custo-atual",
  "itens-gestao",
  "itens-variedade-perdas",
  "itens-cestas",
  "vendas-distribuicoes",
  "vendas-clientes",
  "vendas-resumo",
  "vendas-vendedor",
  "vendas-descontos",
  "vendas-municipio",
]);
export type CampoQueryProfile = z.infer<typeof campoQueryProfileSchema>;

/** Fixed synthetic schemas matching the curated cases, never inferred from an ERP. */
export function campoQueryTables(input: CampoQueryProfile): PublicationFixtureTable[] {
  const profile = campoQueryProfileSchema.parse(input);
  if (profile === "estoque-locais" || profile === "estoque-saldos") {
    const tables = [
      {
        table: "dbo.localarmazenagem",
        columns: [
          { name: "codlocalarmazenagem", type: "integer" },
          { name: "nome", type: "string", nullable: true },
        ],
        primaryKey: ["codlocalarmazenagem"],
      },
      {
        table: "dbo.localarmazenagemfilial",
        columns: [
          { name: "codempresa", type: "integer" },
          { name: "codfilial", type: "integer" },
          { name: "codlocalarmazenagem", type: "integer" },
        ],
        primaryKey: ["codempresa", "codfilial", "codlocalarmazenagem"],
      },
    ];
    if (profile === "estoque-saldos")
      tables.push(
        {
          table: "dbo.saldoestoque",
          columns: [
            { name: "codlocalarmazenagem", type: "integer" },
            { name: "codproduto", type: "integer" },
            ...["saldoatual", "quantidadepedidocompra"].map((name) => ({
              name,
              type: "decimal",
              nullable: true,
            })),
          ],
          primaryKey: ["codlocalarmazenagem", "codproduto"],
        },
        {
          table: "dbo.produto",
          columns: [
            { name: "codproduto", type: "integer" },
            ...["nome", "codunidademedida"].map((name) => ({
              name,
              type: "string",
              nullable: true,
            })),
            ...["codmarca", "codgrupoproduto"].map((name) => ({
              name,
              type: "integer",
              nullable: true,
            })),
          ],
          primaryKey: ["codproduto"],
        },
      );
    if (profile === "estoque-saldos")
      tables.push(
        {
          table: "dbo.marca",
          columns: [
            { name: "codmarca", type: "integer" },
            { name: "nome", type: "string", nullable: true },
          ],
          primaryKey: ["codmarca"],
        },
        {
          table: "dbo.grupoproduto",
          columns: [
            { name: "codgrupoproduto", type: "integer" },
            { name: "nome", type: "string", nullable: true },
          ],
          primaryKey: ["codgrupoproduto"],
        },
      );
    return fixtureTablesSchema.parse(
      profile === "estoque-saldos"
        ? tables.filter((t) => t.table !== "dbo.localarmazenagemfilial")
        : tables,
    );
  }
  if (profile === "cadastro-filiais") {
    return fixtureTablesSchema.parse([
      {
        table: "dbo.filial",
        columns: [
          { name: "codempresa", type: "integer" },
          { name: "codfilial", type: "integer" },
          ...["nome", "nomefantasia", "regimetributario", "cnpj", "cnae", "inscricaoestadual"].map(
            (name) => ({ name, type: "string", nullable: true }),
          ),
          { name: "codmunicipio", type: "integer", nullable: true },
          ...["logradouro", "numerologradouro", "bairro", "cep"].map((name) => ({
            name,
            type: "string",
            nullable: true,
          })),
        ],
        primaryKey: ["codempresa", "codfilial"],
      },
      {
        table: "dbo.municipio",
        columns: [
          { name: "codmunicipio", type: "integer" },
          { name: "nome", type: "string", nullable: true },
          { name: "uf", type: "string", nullable: true },
        ],
        primaryKey: ["codmunicipio"],
      },
    ]);
  }

  if (profile === "prazo-filial-receber" || profile === "prazo-filial-pagar") {
    const side = profile === "prazo-filial-receber" ? "receber" : "pagar";
    return fixtureTablesSchema.parse([
      {
        table: `dbo.conta${side}`,
        columns: [
          { name: "codempresa", type: "integer" },
          { name: "codfilial", type: "integer" },
          { name: `codconta${side}`, type: "integer" },
          { name: "moeda", type: "string", nullable: true },
          { name: "status", type: "string" },
          { name: `saldo${side}`, type: "decimal", nullable: true },
          { name: "dataemissao", type: "date", nullable: true },
          { name: "datavencimento", type: "date", nullable: true },
        ],
        primaryKey: ["codempresa", `codconta${side}`],
      },
    ]);
  }
  if (profile === "itens-variedade-perdas") {
    const allowed = new Set([
      "codempresa",
      "codfilial",
      "codprodutovendido",
      "itemprodutovendido",
      "codproduto",
      "quantidade",
      "valoritem",
      "custovenda",
      "codtipooperacaosaida",
      "datavenda",
      "prevenda",
      "codvendedor",
      "gerafinanceiro",
    ]);
    return fixtureTablesSchema.parse(
      campoQueryTables("itens-gestao")
        .slice(0, 3)
        .map((table) => ({
          ...table,
          columns: table.columns.filter((column) => allowed.has(column.name)),
        })),
    );
  }
  if (profile === "itens-gestao") {
    const specs: [string, string[], [string, "integer" | "string" | "decimal" | "date"][]][] = [
      [
        "dbo.itemprodutovendido",
        ["codempresa", "codprodutovendido", "itemprodutovendido"],
        [
          ["codempresa", "integer"],
          ["codprodutovendido", "integer"],
          ["itemprodutovendido", "integer"],
          ["codproduto", "integer"],
          ["nomeproduto", "string"],
          ["codunidademedida", "string"],
          ["quantidade", "decimal"],
          ["valoritem", "decimal"],
          ["custovenda", "decimal"],
        ],
      ],
      [
        "dbo.produtovendido",
        ["codempresa", "codprodutovendido"],
        [
          ["codempresa", "integer"],
          ["codfilial", "integer"],
          ["codprodutovendido", "integer"],
          ["codtipooperacaosaida", "integer"],
          ["datavenda", "date"],
          ["prevenda", "string"],
          ["codvendedor", "integer"],
          ["valorbruto", "decimal"],
          ["valordesconto", "decimal"],
          ["valorliquido", "decimal"],
        ],
      ],
      [
        "dbo.tipooperacaosaida",
        ["codempresa", "codtipooperacaosaida"],
        [
          ["codempresa", "integer"],
          ["codtipooperacaosaida", "integer"],
          ["gerafinanceiro", "string"],
        ],
      ],
      [
        "dbo.produto",
        ["codproduto"],
        [
          ["codproduto", "integer"],
          ["codmarca", "integer"],
          ["codgrupoproduto", "integer"],
          ["nome", "string"],
        ],
      ],
      [
        "dbo.marca",
        ["codmarca"],
        [
          ["codmarca", "integer"],
          ["nome", "string"],
        ],
      ],
      [
        "dbo.grupoproduto",
        ["codgrupoproduto"],
        [
          ["codgrupoproduto", "integer"],
          ["nome", "string"],
        ],
      ],
    ];
    return fixtureTablesSchema.parse(
      specs.map(([table, primaryKey, fields]) => ({
        table,
        primaryKey,
        columns: fields.map(([name, type]) => ({
          name,
          type,
          nullable: !primaryKey.includes(name),
        })),
      })),
    );
  }
  if (profile === "custo-atual") {
    const specs: [string, string[], [string, "integer" | "string" | "decimal"][]][] = [
      [
        "dbo.custoproduto",
        ["codempresa", "codfilial", "codproduto"],
        [
          ["codempresa", "integer"],
          ["codfilial", "integer"],
          ["codproduto", "integer"],
          ["custocompra", "decimal"],
          ["customedioponderado", "decimal"],
          ["ultimoprecocompra", "decimal"],
        ],
      ],
      [
        "dbo.produto",
        ["codproduto"],
        [
          ["codproduto", "integer"],
          ["nome", "string"],
          ["codunidademedida", "string"],
          ["codgrupoproduto", "integer"],
          ["codmarca", "integer"],
        ],
      ],
      [
        "dbo.unidademedida",
        ["codunidademedida"],
        [
          ["codunidademedida", "string"],
          ["descricao", "string"],
        ],
      ],
      [
        "dbo.grupoproduto",
        ["codgrupoproduto"],
        [
          ["codgrupoproduto", "integer"],
          ["nome", "string"],
        ],
      ],
      [
        "dbo.marca",
        ["codmarca"],
        [
          ["codmarca", "integer"],
          ["nome", "string"],
        ],
      ],
    ];
    return fixtureTablesSchema.parse(
      specs.map(([table, primaryKey, fields]) => ({
        table,
        primaryKey,
        columns: fields.map(([name, type]) => ({
          name,
          type,
          nullable: !primaryKey.includes(name),
        })),
      })),
    );
  }
  if (profile === "agenda-receber-pagar") {
    return [...campoQueryTables("horizonte-receber"), ...campoQueryTables("horizonte-pagar")];
  }
  if (
    profile === "itens-cestas" ||
    profile === "vendas-distribuicoes" ||
    profile === "vendas-clientes" ||
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
