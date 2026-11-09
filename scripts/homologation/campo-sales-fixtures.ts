import {
  fixtureTablesSchema,
  type PublicationFixtureTable,
} from "../../src/domain/persona-v2/publication-fixture.js";
type Field = [string, "integer" | "string" | "date" | "decimal"];
function table(name: string, keys: string[], fields: Field[]) {
  return {
    table: name,
    primaryKey: keys,
    columns: fields.map(([name, type]) => ({ name, type, nullable: !keys.includes(name) })),
  };
}
export function campoSalesTables(
  profile:
    | "vendas-resumo"
    | "vendas-vendedor"
    | "vendas-municipio"
    | "vendas-descontos"
    | "vendas-clientes"
    | "vendas-distribuicoes"
    | "itens-cestas",
): PublicationFixtureTable[] {
  const seller = profile === "vendas-vendedor" || profile === "vendas-descontos";
  const dimension = seller
    ? "codvendedor"
    : profile === "vendas-clientes"
      ? "codcliente"
      : profile === "vendas-municipio"
        ? "codmunicipio"
        : undefined;
  const fields: Field[] = [
    ["codempresa", "integer"],
    ["codfilial", "integer"],
    ["codprodutovendido", "integer"],
    ["codtipooperacaosaida", "integer"],
    ["datavenda", "date"],
    ["prevenda", "string"],
  ];
  if (profile === "vendas-descontos") {
    fields.push(["valorbruto", "decimal"], ["valordesconto", "decimal"]);
  } else if (profile !== "itens-cestas") {
    fields.push(["valorliquido", "decimal"]);
  }
  if (dimension) fields.push([dimension, "integer"]);
  if (profile === "vendas-distribuicoes")
    fields.push(
      ["codcondicaopagamento", "integer"],
      ["codfornecedor", "integer"],
      ["valorfrete", "decimal"],
      ["codvendedor", "integer"],
      ["codcliente", "integer"],
    );
  const tables = [
    table("dbo.produtovendido", ["codempresa", "codprodutovendido"], fields),
    table(
      "dbo.tipooperacaosaida",
      ["codempresa", "codtipooperacaosaida"],
      [
        ["codempresa", "integer"],
        ["codtipooperacaosaida", "integer"],
        ["gerafinanceiro", "string"],
      ],
    ),
  ];
  if (seller)
    tables.push(
      table(
        "dbo.vendedor",
        ["codvendedor"],
        [
          ["codvendedor", "integer"],
          ["nome", "string"],
        ],
      ),
    );
  if (profile === "vendas-municipio")
    tables.push(
      table(
        "dbo.municipio",
        ["codmunicipio"],
        [
          ["codmunicipio", "integer"],
          ["nome", "string"],
          ["uf", "string"],
        ],
      ),
    );
  if (profile === "itens-cestas")
    tables.push(
      table(
        "dbo.itemprodutovendido",
        ["codempresa", "codprodutovendido", "itemprodutovendido"],
        [
          ["codempresa", "integer"],
          ["codprodutovendido", "integer"],
          ["itemprodutovendido", "integer"],
          ["codproduto", "integer"],
          ["codunidademedida", "string"],
          ["quantidade", "decimal"],
          ["valorunitarioliquido", "decimal"],
          ["valoritem", "decimal"],
        ],
      ),
    );
  return fixtureTablesSchema.parse(tables);
}
