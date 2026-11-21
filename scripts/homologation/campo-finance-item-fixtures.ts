import {
  fixtureTablesSchema,
  type PublicationFixtureTable,
} from "../../src/domain/persona-v2/publication-fixture.js";

type Type = "integer" | "string" | "decimal" | "date";
type Field = [string, Type];
/** Metadata-checked synthetic keys; nullable non-keys permit defensive cases. */
export function campoFinanceItemTables(
  profile:
    "pagamentos-efetivos" | "pontualidade-recebimentos" | "itens-detalhados" | "itens-resumos",
): PublicationFixtureTable[] {
  if (profile === "itens-resumos") {
    const omitted = new Set([
      "nomeproduto",
      "codlocalarmazenagem",
      "precounitario",
      "valorunitarioliquido",
      "geracomissao",
      "movimentaestoque",
    ]);
    return fixtureTablesSchema.parse(
      campoFinanceItemTables("itens-detalhados")
        .slice(0, 3)
        .map((table) => ({
          ...table,
          columns: table.columns.filter((column) => !omitted.has(column.name)),
        })),
    );
  }
  const t = (name: string, keys: string[], fields: Field[]) => ({
    table: `dbo.${name}`,
    primaryKey: keys,
    columns: fields.map(([name, type]) => ({
      name,
      type,
      nullable: !keys.includes(name),
      ...(type === "date" ? { temporalStorage: "datetime2_3" } : {}),
    })),
  });
  const ids = (...names: string[]): Field[] => names.map((n) => [n, "integer"]);
  const strings = (...names: string[]): Field[] => names.map((n) => [n, "string"]);
  const decimals = (...names: string[]): Field[] => names.map((n) => [n, "decimal"]);
  const dates = (...names: string[]): Field[] => names.map((n) => [n, "date"]);
  if (profile === "pagamentos-efetivos")
    return fixtureTablesSchema.parse([
      t(
        "pagamentotitulo",
        ["codempresa", "codpagamento", "codcontapagar"],
        [
          ...ids("codempresa", "codpagamento", "codcontapagar"),
          ...strings("status"),
          ...dates("datapagamento", "datacancelamentopagamento"),
          ...decimals("valorpagamentoliquido"),
        ],
      ),
      t(
        "contapagar",
        ["codempresa", "codcontapagar"],
        [...ids("codempresa", "codcontapagar", "codfilial"), ...strings("moeda")],
      ),
    ]);
  if (profile === "pontualidade-recebimentos")
    return fixtureTablesSchema.parse([
      t(
        "recebimentotitulo",
        ["codempresa", "codrecebimento", "codcontareceber"],
        [
          ...ids("codempresa", "codrecebimento", "codcontareceber"),
          ...strings("status"),
          ...dates("datarecebimento", "datavencimentooriginal"),
          ...decimals("valorrecebimentoliquido"),
        ],
      ),
      t(
        "recebimento",
        ["codempresa", "codrecebimento"],
        [...ids("codempresa", "codrecebimento"), ...strings("status")],
      ),
      t(
        "contareceber",
        ["codempresa", "codcontareceber"],
        [...ids("codempresa", "codcontareceber", "codfilial"), ...strings("moeda")],
      ),
    ]);
  return fixtureTablesSchema.parse([
    t(
      "itemprodutovendido",
      ["codempresa", "codprodutovendido", "itemprodutovendido"],
      [
        ...ids(
          "codempresa",
          "codprodutovendido",
          "codproduto",
          "codlocalarmazenagem",
          "codtabelapreco",
          "codpromocao",
        ),
        ...strings("itemprodutovendido", "nomeproduto", "codunidademedida"),
        ...decimals(
          "quantidade",
          "precounitario",
          "valorunitarioliquido",
          "valoricms",
          "valoriss",
          "valoripi",
          "valorpis",
          "valorcofins",
          "valorcsll",
          "valorsimples",
          "customedio",
          "custoreposicao",
          "valorcustofixo",
          "pontoequilibrio",
          "custovenda",
          "valoracrescimo",
          "valordesconto",
          "valoritem",
        ),
      ],
    ),
    t(
      "produtovendido",
      ["codempresa", "codprodutovendido"],
      [
        ...ids("codempresa", "codprodutovendido", "codfilial", "codtipooperacaosaida"),
        ...dates("datavenda"),
        ...strings("prevenda"),
      ],
    ),
    t(
      "tipooperacaosaida",
      ["codempresa", "codtipooperacaosaida"],
      [
        ...ids("codempresa", "codtipooperacaosaida"),
        ...strings("gerafinanceiro", "geracomissao", "movimentaestoque"),
      ],
    ),
    t(
      "localarmazenagem",
      ["codlocalarmazenagem"],
      [...ids("codlocalarmazenagem"), ...strings("nome")],
    ),
    t("tabelapreco", ["codtabelapreco"], [...ids("codtabelapreco"), ...strings("nome")]),
    t(
      "promocao",
      ["codempresa", "codpromocao"],
      [...ids("codempresa", "codpromocao"), ...strings("descricao")],
    ),
  ]);
}
