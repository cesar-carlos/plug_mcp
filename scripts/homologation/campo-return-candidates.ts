import {
  queryPublicationCaseSchema,
  type QueryPublicationCase,
} from "../../src/domain/persona-v2/publication-fixture.js";
import { campoReturnTables } from "./campo-return-fixtures.js";
type Value = string | number | null;
type Column = [string, "integer" | "decimal" | "string" | "date"];
/** Synthetic review candidates only; expected amounts are hand-calculated, not SQL output. */
export function campoReturnCandidates(): Record<string, QueryPublicationCase> {
  const headers: Value[][] = [
    [1, 1, 3, "D", "2030-01-01T00:00:00.000Z"],
    [1, 2, 5, "D", "2030-01-01T23:59:59.997Z"],
    [1, 3, null, "D", "2030-01-02T12:00:00.000Z"],
    [1, 4, 3, "C", "2030-01-01T12:00:00.000Z"],
    [1, 5, 3, null, "2030-01-01T12:00:00.000Z"],
    [1, 6, 3, "D", "2029-12-31T23:59:59.997Z"],
    [1, 7, 3, "D", "2030-01-03T00:00:00.000Z"],
    [2, 1, 3, "D", "2030-01-01T00:00:00.000Z"],
    [1, 8, 3, "D", "2030-01-01T12:00:00.000Z"],
  ];
  const items: Value[][] = [
    [1, 1, "01", 10, "UN", "2", "10.25"],
    [1, 1, "02", 10, "UN", "1", "4.50"],
    [1, 1, "03", 20, "KG", "1.5", "8.00"],
    [1, 2, "01", 10, "UN", "3", "5.00"],
    [1, 2, "02", 10, "KG", "2", "2.50"],
    [1, 3, "01", 20, "KG", "2", "7.00"],
    ...[4, 5, 6, 7].map((id) => [1, id, "01", 10, "UN", "1", "1000"]),
    [2, 1, "01", 10, "UN", "1", "1000"],
    [1, 8, "01", 10, "XX", "1", "1000"],
    [1, 8, "02", 10, null, "1", "1000"],
  ];
  const raw: Record<string, Record<string, Value>[]> = {
    "dbo.itemdevolucaovenda": items.map(([company, id, item, product, unit, qty, price]) => ({
      codempresa: company!,
      coddevolucaovenda: id!,
      itemdevolucaovenda: item!,
      codproduto: product!,
      nomeproduto: product === 10 ? "Produto A" : "Produto B",
      codunidademedida: unit!,
      quantidade: qty!,
      valorunitario: price!,
    })),
    "dbo.devolucaovenda": headers.map(([company, id, branch, status, date]) => ({
      codempresa: company!,
      coddevolucaovenda: id!,
      codtipooperacaodevolucao: 1,
      codfilial: branch!,
      status: status!,
      data: date!,
    })),
    "dbo.tipooperacaodevolucao": [
      { codempresa: 1, codtipooperacaodevolucao: 1 },
      { codempresa: 2, codtipooperacaodevolucao: 1 },
    ],
    "dbo.unidademedida": [{ codunidademedida: "UN" }, { codunidademedida: "KG" }],
  };
  const scalar = (type: string, value: Value) =>
    value === null ? { type: "null", value: null } : { type, value: String(value) };
  const fixtures = campoReturnTables().map((t) => ({
    table: t.table,
    rows: raw[t.table]!.map((r) =>
      Object.fromEntries(t.columns.map((c) => [c.name, scalar(c.type, r[c.name]!)])),
    ),
  }));
  const metrics: Column[] = [
    ["quantidadeitens", "integer"],
    ["quantidadedevolucoes", "integer"],
    ["valordevolvido", "decimal"],
  ];
  const columns: Record<string, Column[]> = {
    dia: [["codempresa", "integer"], ["dia", "date"], ...metrics],
    filial: [["codempresa", "integer"], ["codfilial", "integer"], ...metrics],
    produto: [
      ["codempresa", "integer"],
      ["codproduto", "integer"],
      ["codunidademedida", "string"],
      ...metrics,
      ["nomeproduto", "string"],
      ["quantidadedevolvida", "decimal"],
    ],
  };
  // doc1=20.50+4.50+12=37; doc2=15+5=20; doc3=14. Total=71.
  const expected: Record<string, Value[][]> = {
    dia: [
      [1, "2030-01-01", 5, 2, "57.00"],
      [1, "2030-01-02", 1, 1, "14.00"],
    ],
    filial: [
      [1, null, 1, 1, "14.00"],
      [1, 3, 3, 1, "37.00"],
      [1, 5, 2, 1, "20.00"],
    ],
    produto: [
      [1, 10, "KG", 1, 1, "5.00", "Produto A", "2"],
      [1, 10, "UN", 3, 2, "40.00", "Produto A", "6"],
      [1, 20, "KG", 2, 2, "26.00", "Produto B", "3.5"],
    ],
  };
  const make = (kind: string, rows: Value[][], params: Record<string, Value>, name: string) =>
    queryPublicationCaseSchema.parse({
      name,
      input: {
        params: {
          empresa: 1,
          filial: null,
          datainicio: "2030-01-01",
          datafim: "2030-01-02",
          ...params,
        },
        fixtures: structuredClone(fixtures),
      },
      expected: {
        columns: columns[kind]!.map(([name, type]) => ({ name, type })),
        rows: rows.map((row) =>
          Object.fromEntries(
            columns[kind]!.map(([name, type], i) => [name, scalar(type, row[i]!)]),
          ),
        ),
        ordered: true,
        completeness: { mode: "complete" },
      },
    });
  const result: Record<string, QueryPublicationCase> = {};
  for (const kind of ["dia", "filial", "produto"]) {
    result[kind] = make(
      kind,
      expected[kind]!,
      {},
      "Devoluções sintéticas por " + kind + ": limites, duplicidade, unidades e filtros",
    );
    result[kind + "_vazio"] = make(
      kind,
      [],
      { datainicio: "2031-01-01", datafim: "2031-01-02" },
      "Devoluções por " + kind + ": período sem linhas",
    );
  }
  result.filial_restrita = make(
    "filial",
    [[1, 3, 3, 1, "37.00"]],
    { filial: 3 },
    "Devoluções: filtro solicitado de filial 3 (não comprova concessão)",
  );
  return result;
}
