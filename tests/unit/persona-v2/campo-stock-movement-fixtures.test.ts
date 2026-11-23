import { expect, it } from "vitest";
import { manualPublicationTables } from "../../../scripts/homologation/manual-publication-tables.js";
import { normalizeStockFixtureAliases } from "../../../scripts/homologation/stock-sql.js";

it("normaliza aliases da fixture sem alterar literais, comentários ou parâmetros", () => {
  const sql = `SELECT NomeProduto, MAX(p.NomeProduto) AS Produto, 'NomeProduto', N'Produto', 'a''NomeProduto', [NomeProduto], "Produto" FROM p -- NomeProduto
WHERE p.NomeProduto = :NomeProduto AND p.id = @Produto /* Produto */ ORDER BY Produto`;
  expect(normalizeStockFixtureAliases(sql, ["NomeProduto", "Produto"])).toBe(
    `SELECT nomeproduto, MAX(p.nomeproduto) AS produto, 'NomeProduto', N'Produto', 'a''NomeProduto', [NomeProduto], "Produto" FROM p -- NomeProduto
WHERE p.nomeproduto = :NomeProduto AND p.id = @Produto /* Produto */ ORDER BY produto`,
  );
});

it("declara somente movimentos e suas dimensões em MSSQL e SQL Anywhere", () => {
  const profile = "estoque-movimentos";
  for (const dialect of ["mssql", "sybase"]) {
    const tables = manualPublicationTables(dialect, false, undefined, profile);
    expect(tables.map(({ table }) => table).sort()).toEqual([
      "dbo.grupoproduto",
      "dbo.localarmazenagem",
      "dbo.marca",
      "dbo.movimentacaoestoque",
      "dbo.produto",
    ]);
    expect(tables.find(({ table }) => table === "dbo.movimentacaoestoque")).toMatchObject({
      primaryKey: ["codempresa", "codmovimentacaoestoque"],
      columns: [
        { name: "codempresa", type: "integer" },
        { name: "codmovimentacaoestoque", type: "integer" },
        { name: "datamovimento", type: "date" },
        { name: "codlocalarmazenagem", type: "integer" },
        { name: "codproduto", type: "integer" },
        { name: "quantidadeconvertida", type: "decimal" },
      ],
    });
  }
  expect(manualPublicationTables("postgres", false, undefined, profile)).toEqual(
    manualPublicationTables("postgres"),
  );
  expect(manualPublicationTables("sybase", false, undefined, "estoque-saldos")).toEqual(
    manualPublicationTables("sybase"),
  );
});

it("combina saldo atual com venda tipada sem saldo historico no perfil especifico", () => {
  const tables = manualPublicationTables("mssql", false, undefined, "estoque-atual-vendas");
  expect(tables.map(({ table }) => table).sort()).toEqual([
    "dbo.grupoproduto",
    "dbo.localarmazenagem",
    "dbo.marca",
    "dbo.movimentacaoestoque",
    "dbo.produto",
    "dbo.saldoestoque",
  ]);
  expect(tables.find(({ table }) => table === "dbo.movimentacaoestoque")?.columns).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: "origem", type: "string" }),
      expect.objectContaining({ name: "codtipomovimentoestoque", type: "integer" }),
    ]),
  );
  expect(tables.find(({ table }) => table === "dbo.saldoestoque")?.columns).toEqual(
    expect.arrayContaining([expect.objectContaining({ name: "saldoatual", nullable: true })]),
  );
});
