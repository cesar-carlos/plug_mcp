import {
  fixtureTablesSchema,
  type PublicationFixtureTable,
} from "../../src/domain/persona-v2/publication-fixture.js";

/** Synthetic catalogue fixtures only; keys do not certify the operational source. */
export function campoCatalogTables(
  profile: "cadastro-produtos" | "cadastro-tipos-operacao",
): PublicationFixtureTable[] {
  type Field = [string, "integer" | "string" | "decimal"];
  const table = (name: string, keys: string[], fields: Field[]) => ({
    table: name,
    primaryKey: keys,
    columns: fields.map(([name, type]) => ({ name, type, nullable: !keys.includes(name) })),
  });
  if (profile === "cadastro-tipos-operacao")
    return fixtureTablesSchema.parse([
      table(
        "dbo.tipooperacaosaida",
        ["codempresa", "codtipooperacaosaida"],
        [
          ["codempresa", "integer"],
          ["codtipooperacaosaida", "integer"],
          ["codfilial", "integer"],
          ["descricao", "string"],
          ["gerafinanceiro", "string"],
          ["movimentaestoque", "string"],
        ],
      ),
    ]);
  return fixtureTablesSchema.parse([
    table(
      "dbo.produto",
      ["codproduto"],
      [
        ["codproduto", "integer"],
        ["nome", "string"],
        ["ativo", "string"],
        ["codunidademedida", "string"],
        ["codgrupoproduto", "integer"],
        ["codmarca", "integer"],
        ["ncm", "string"],
        ["codigobarras1", "string"],
        ["codigoreferencia", "string"],
        ["codigofabricante", "string"],
        ["codigooriginal", "string"],
        ["codigofornecedor", "string"],
        ["precovenda", "decimal"],
      ],
    ),
    table(
      "dbo.unidademedida",
      ["codunidademedida"],
      [
        ["codunidademedida", "string"],
        ["descricao", "string"],
      ],
    ),
    table(
      "dbo.grupoproduto",
      ["codgrupoproduto"],
      [
        ["codgrupoproduto", "integer"],
        ["nome", "string"],
      ],
    ),
    table(
      "dbo.marca",
      ["codmarca"],
      [
        ["codmarca", "integer"],
        ["nome", "string"],
      ],
    ),
  ]);
}
