import {
  queryPublicationCaseSchema,
  type QueryPublicationCase,
} from "../../src/domain/persona-v2/publication-fixture.js";
import { campoFinanceItemTables } from "./campo-finance-item-fixtures.js";

/** Review candidates only. Does not run SQL, save cases or approve reports. */
export function campoFinanceItemCandidates(): {
  payments: QueryPublicationCase[];
  receipts: QueryPublicationCase;
  discounts: QueryPublicationCase;
  promotions: QueryPublicationCase;
  taxes: QueryPublicationCase;
} {
  type Profile = Parameters<typeof campoFinanceItemTables>[0];
  const make = (
    profile: Profile,
    name: string,
    seeds: Record<string, Record<string, string | number | null>[]>,
    columns: [string, "integer" | "decimal" | "string" | "date"][],
    values: (string | number | null)[][],
  ) => {
    const tables = campoFinanceItemTables(profile);
    const scalar = (type: string, value: string | number | null) =>
      value === null ? { type: "null", value: null } : { type, value: String(value) };
    return queryPublicationCaseSchema.parse({
      name,
      input: {
        params: { datainicio: "2030-01-01", datafim: "2030-01-01" },
        fixtures: tables.map((t) => ({
          table: t.table,
          rows: (seeds[t.table] ?? []).map((r) =>
            Object.fromEntries(t.columns.map((c) => [c.name, scalar(c.type, r[c.name] ?? null)])),
          ),
        })),
      },
      expected: {
        columns: columns.map(([name, type]) => ({ name, type })),
        rows: values.map((row) =>
          Object.fromEntries(
            columns.map(([name, type], i) => [name, scalar(type, row[i] ?? null)]),
          ),
        ),
        ordered: true,
      },
    });
  };
  const paymentSeeds = {
    "dbo.contapagar": [{ codempresa: 1, codcontapagar: 1, codfilial: 3, moeda: "BRL" }],
    "dbo.pagamentotitulo": [
      [1, "2030-01-01T00:00:00.000Z", "P", null, "10.25"],
      [2, "2030-01-01T23:59:59.997Z", "P", null, "5.75"],
      [3, "2030-01-02T00:00:00.000Z", "P", null, "100"],
      [4, "2030-01-01T12:00:00.000Z", "P", "2030-01-01T13:00:00.000Z", "100"],
      [5, "2030-01-01T12:00:00.000Z", "C", null, "100"],
      [6, "2029-12-31T23:59:59.997Z", "P", null, "100"],
    ].map(([id, date, status, cancel, value]) => ({
      codempresa: 1,
      codpagamento: id!,
      codcontapagar: 1,
      datapagamento: date!,
      status: status!,
      datacancelamentopagamento: cancel!,
      valorpagamentoliquido: value!,
    })),
  };
  const paymentColumns: [string, "integer" | "string" | "date" | "decimal"][] = [
    ["codempresa", "integer"],
    ["codfilial", "integer"],
    ["moeda", "string"],
    ["diapagamento", "date"],
    ["baixas", "integer"],
    ["baixassemvalor", "integer"],
    ["valorliquidopago", "decimal"],
  ];
  const payments = [
    make(
      "pagamentos-efetivos",
      "parciais do mesmo título, limites e cancelamentos",
      paymentSeeds,
      paymentColumns,
      [[1, 3, "BRL", "2030-01-01", 2, 0, "16.00"]],
    ),
    make(
      "pagamentos-efetivos",
      "valor ausente impede total definitivo",
      {
        ...paymentSeeds,
        "dbo.pagamentotitulo": [
          ...paymentSeeds["dbo.pagamentotitulo"],
          {
            codempresa: 1,
            codpagamento: 7,
            codcontapagar: 1,
            datapagamento: "2030-01-01T12:00:00.000Z",
            status: "P",
            datacancelamentopagamento: null,
            valorpagamentoliquido: null,
          },
        ],
      },
      paymentColumns,
      [[1, 3, "BRL", "2030-01-01", 3, 1, null]],
    ),
  ];
  const receipts = make(
    "pontualidade-recebimentos",
    "baixas parciais, vencimento ausente e exclusões",
    {
      "dbo.contareceber": [{ codempresa: 1, codcontareceber: 1, codfilial: 3, moeda: "BRL" }],
      "dbo.recebimento": [1, 2, 3, 4, 5, 6, 7, 8, 9].map((id) => ({
        codempresa: 1,
        codrecebimento: id,
        status: id === 5 ? "C" : "R",
      })),
      "dbo.recebimentotitulo": [
        [1, "2030-01-02T00:00:00.000Z", "10"],
        [2, "2030-01-01T00:00:00.000Z", "20"],
        [3, "2029-12-31T00:00:00.000Z", "30"],
        [4, "2029-12-31T00:00:00.000Z", "40"],
        [5, null, "100"],
        [6, null, "0"],
        [7, null, null],
        [8, null, "100"],
        [9, null, "50"],
      ].map(([id, due, value]) => ({
        codempresa: 1,
        codrecebimento: id!,
        codcontareceber: 1,
        status: "R",
        datavencimentooriginal: due!,
        valorrecebimentoliquido: value!,
        datarecebimento: id === 8 ? "2030-01-02T00:00:00.000Z" : "2030-01-01T12:00:00.000Z",
      })),
    },
    [
      ["codempresa", "integer"],
      ["codfilial", "integer"],
      ["moeda", "string"],
      ["ano", "integer"],
      ["mes", "integer"],
      ["baixas", "integer"],
      ["antecipadas", "integer"],
      ["nodia", "integer"],
      ["atrasadas", "integer"],
      ["semvencimentooriginal", "integer"],
      ["valorrecebido", "decimal"],
      ["percentualbaixasnoprazo", "decimal"],
      ["percentualvalornoprazo", "decimal"],
    ],
    [[1, 3, "BRL", 2030, 1, 5, 1, 1, 2, 1, "150", "50", "30"]],
  );
  const itemSeeds = {
    "dbo.produtovendido": [
      {
        codempresa: 1,
        codprodutovendido: 1,
        codfilial: 3,
        codtipooperacaosaida: 1,
        datavenda: "2030-01-01T23:59:59.997Z",
        prevenda: "N",
      },
    ],
    "dbo.tipooperacaosaida": [
      {
        codempresa: 1,
        codtipooperacaosaida: 1,
        gerafinanceiro: "S",
        geracomissao: "S",
        movimentaestoque: "S",
      },
    ],
    "dbo.itemprodutovendido": [
      ["01", "2.00"],
      ["02", "0.00"],
      ["03", null],
    ].map(([id, discount]) => ({
      codempresa: 1,
      codprodutovendido: 1,
      itemprodutovendido: id!,
      codproduto: 7,
      codunidademedida: "UN",
      codlocalarmazenagem: 1,
      codpromocao: null,
      codtabelapreco: null,
      quantidade: "1.00",
      valoritem: "10.00",
      valordesconto: discount!,
      valoracrescimo: "0.00",
    })),
  };
  const discounts = make(
    "itens-detalhados",
    "desconto zero, positivo e desconhecido no denominador",
    itemSeeds,
    [
      ["codempresa", "integer"],
      ["codfilial", "integer"],
      ["codproduto", "integer"],
      ["itens", "integer"],
      ["comvalorinformado", "integer"],
      ["comdesconto", "integer"],
      ["frequenciapercentual", "decimal"],
    ],
    [[1, 3, 7, 3, 2, 1, "50"]],
  );
  const promotions = make(
    "itens-detalhados",
    "promoção e tabela ausentes não apagam itens",
    itemSeeds,
    [
      ["codempresa", "integer"],
      ["codproduto", "integer"],
      ["codunidademedida", "string"],
      ["codpromocao", "integer"],
      ["codtabelapreco", "integer"],
      ["quantidadeitens", "integer"],
      ["registroscomquantidade", "integer"],
      ["registroscomvalor", "integer"],
      ["registroscomdesconto", "integer"],
      ["quantidaderegistrada", "decimal"],
      ["valorregistrado", "decimal"],
      ["descontoregistrado", "decimal"],
      ["acrescimoregistrado", "decimal"],
    ],
    [[1, 7, "UN", null, null, 3, 3, 3, 2, "3", "30", "2", "0"]],
  );
  const taxFields = [
    "quantidade",
    "valoritem",
    "customedio",
    "custoreposicao",
    "valorcustofixo",
    "pontoequilibrio",
    "custovenda",
    "valoricms",
    "valoriss",
    "valoripi",
    "valorpis",
    "valorcofins",
    "valorcsll",
    "valorsimples",
  ];
  const taxRow = {
    ...itemSeeds["dbo.itemprodutovendido"][0]!,
    customedio: "1.25",
    custoreposicao: "2.75",
    valoricms: "0.00",
    valorpis: "0.15",
  };
  const taxes = make(
    "itens-detalhados",
    "tributos e custos preservam zero, decimais e nulos",
    { ...itemSeeds, "dbo.itemprodutovendido": [taxRow] },
    [
      ["codempresa", "integer"],
      ["codprodutovendido", "integer"],
      ["itemprodutovendido", "string"],
      ["codproduto", "integer"],
      ["codunidademedida", "string"],
      ...taxFields.map((n) => [n, "decimal"] as [string, "decimal"]),
    ],
    [
      [
        1,
        1,
        "01",
        7,
        "UN",
        "1",
        "10",
        "1.25",
        "2.75",
        null,
        null,
        null,
        "0",
        null,
        null,
        "0.15",
        null,
        null,
        null,
      ],
    ],
  );
  return { payments, receipts, discounts, promotions, taxes };
}
