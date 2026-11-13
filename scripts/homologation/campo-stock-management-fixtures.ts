import { fixtureTablesSchema } from "../../src/domain/persona-v2/publication-fixture.js";
/** Synthetic columns from curated ERP samples. No inferred warehouse/branch mapping. */
export function campoStockManagementTables() {
  return fixtureTablesSchema.parse([
    {
      table: "dbo.saldoestoque",
      primaryKey: ["codlocalarmazenagem", "codproduto"],
      columns: [
        {
          name: "codlocalarmazenagem",
          type: "integer",
          nullable: false,
        },
        {
          name: "codproduto",
          type: "integer",
          nullable: false,
        },
        {
          name: "saldoatual",
          type: "decimal",
          nullable: true,
        },
        {
          name: "quantidadepedidocompra",
          type: "decimal",
          nullable: true,
        },
      ],
    },
    {
      table: "dbo.produto",
      primaryKey: ["codproduto"],
      columns: [
        {
          name: "codproduto",
          type: "integer",
          nullable: false,
        },
        {
          name: "nome",
          type: "string",
          nullable: true,
        },
        {
          name: "codunidademedida",
          type: "string",
          nullable: true,
        },
        {
          name: "codmarca",
          type: "integer",
          nullable: true,
        },
        {
          name: "codgrupoproduto",
          type: "integer",
          nullable: true,
        },
      ],
    },
    {
      table: "dbo.custoproduto",
      primaryKey: ["codempresa", "codfilial", "codproduto"],
      columns: [
        {
          name: "codempresa",
          type: "integer",
          nullable: false,
        },
        {
          name: "codfilial",
          type: "integer",
          nullable: false,
        },
        {
          name: "codproduto",
          type: "integer",
          nullable: false,
        },
        {
          name: "customedioponderado",
          type: "decimal",
          nullable: true,
        },
        {
          name: "custocompra",
          type: "decimal",
          nullable: true,
        },
      ],
    },
    {
      table: "dbo.produtovendido",
      primaryKey: ["codempresa", "codprodutovendido"],
      columns: [
        {
          name: "codempresa",
          type: "integer",
          nullable: false,
        },
        {
          name: "codfilial",
          type: "integer",
          nullable: true,
        },
        {
          name: "codprodutovendido",
          type: "integer",
          nullable: false,
        },
        {
          name: "codtipooperacaosaida",
          type: "integer",
          nullable: true,
        },
        {
          name: "datavenda",
          type: "date",
          nullable: true,
        },
        {
          name: "prevenda",
          type: "string",
          nullable: true,
        },
      ],
    },
    {
      table: "dbo.itemprodutovendido",
      primaryKey: ["codempresa", "codprodutovendido", "itemprodutovendido"],
      columns: [
        {
          name: "codempresa",
          type: "integer",
          nullable: false,
        },
        {
          name: "codprodutovendido",
          type: "integer",
          nullable: false,
        },
        {
          name: "itemprodutovendido",
          type: "integer",
          nullable: false,
        },
        {
          name: "codproduto",
          type: "integer",
          nullable: true,
        },
        {
          name: "codlocalarmazenagem",
          type: "integer",
          nullable: true,
        },
        {
          name: "codunidademedida",
          type: "string",
          nullable: true,
        },
        {
          name: "quantidade",
          type: "decimal",
          nullable: true,
        },
      ],
    },
    {
      table: "dbo.tipooperacaosaida",
      primaryKey: ["codempresa", "codtipooperacaosaida"],
      columns: [
        {
          name: "codempresa",
          type: "integer",
          nullable: false,
        },
        {
          name: "codtipooperacaosaida",
          type: "integer",
          nullable: false,
        },
        {
          name: "gerafinanceiro",
          type: "string",
          nullable: true,
        },
      ],
    },
  ]);
}
