import {
  fixtureTablesSchema,
  type PublicationFixtureTable,
} from "../../src/domain/persona-v2/publication-fixture.js";

/** Closed synthetic return schema; never infers operational constraints from rows. */
export function campoReturnTables(): PublicationFixtureTable[] {
  const integer = (name: string, nullable = false) => ({ name, type: "integer", nullable });
  const string = (name: string, nullable = false) => ({ name, type: "string", nullable });
  return fixtureTablesSchema.parse([
    {
      table: "dbo.itemdevolucaovenda",
      primaryKey: ["codempresa", "coddevolucaovenda", "itemdevolucaovenda"],
      columns: [
        integer("codempresa"),
        integer("coddevolucaovenda"),
        string("itemdevolucaovenda"),
        integer("codproduto"),
        string("nomeproduto"),
        string("codunidademedida", true),
        { name: "quantidade", type: "decimal" },
        { name: "valorunitario", type: "decimal" },
      ],
    },
    {
      table: "dbo.devolucaovenda",
      primaryKey: ["codempresa", "coddevolucaovenda"],
      columns: [
        integer("codempresa"),
        integer("coddevolucaovenda"),
        integer("codtipooperacaodevolucao"),
        integer("codfilial", true),
        string("status", true),
        { name: "data", type: "date", temporalStorage: "datetime2_3" },
      ],
    },
    {
      table: "dbo.tipooperacaodevolucao",
      primaryKey: ["codempresa", "codtipooperacaodevolucao"],
      columns: [integer("codempresa"), integer("codtipooperacaodevolucao")],
    },
    {
      table: "dbo.unidademedida",
      primaryKey: ["codunidademedida"],
      columns: [string("codunidademedida")],
    },
  ]);
}
