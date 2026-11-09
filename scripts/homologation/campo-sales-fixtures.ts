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
  profile: "vendas-resumo" | "vendas-vendedor" | "vendas-municipio",
): PublicationFixtureTable[] {
  const dimension =
    profile === "vendas-vendedor"
      ? "codvendedor"
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
    ["valorliquido", "decimal"],
  ];
  if (dimension) fields.push([dimension, "integer"]);
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
  if (profile === "vendas-vendedor")
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
  return fixtureTablesSchema.parse(tables);
}
