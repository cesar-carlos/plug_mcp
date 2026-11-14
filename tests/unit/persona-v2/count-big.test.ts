import { expect, it } from "vitest";
import { parseSelect } from "../../../src/application/use-cases/shared/sql-ast.js";
import { validateSourceSql } from "../../../src/application/persona-v2/source-sql.js";
import { assertFanoutSeguro } from "../../../src/application/use-cases/shared/assert-fanout.js";
import { parseEscopoSkill } from "../../../src/domain/entities/escopo.js";
import { normalizeParserCountBig } from "../../../src/application/use-cases/shared/sql-parser-count-big.js";

const scope = parseEscopoSkill({
  tabelas: ["vendas", "itens"],
  colunasPorTabela: { vendas: ["id", "data", "valor"], itens: ["venda"] },
  relacionamentos: [
    {
      tabelaOrigem: "vendas",
      colunaOrigem: "id",
      tabelaDestino: "itens",
      colunaDestino: "venda",
      pares: [{ colunaOrigem: "id", colunaDestino: "venda" }],
      tipoJoin: "inner",
      cardinalidade: "N:N",
    },
  ],
});

it.each([
  "COUNT_BIG(*)",
  "count_big ( * )",
  "COUNT_BIG(v.id)",
  "COUNT_BIG(CASE WHEN v.valor > 0 THEN v.id END)",
])("reconhece agregação SQL Server %s sem reescrever SQL", (expr) => {
  const sql = `SELECT CAST(v.data AS date) AS dia, ${expr} AS n, SUM(v.valor)/NULLIF(${expr},0) AS ticket FROM vendas v GROUP BY CAST(v.data AS date) ORDER BY dia`;
  const ast = validateSourceSql(sql, "mssql", scope);
  expect(ast.sql).toBe(sql);
  expect(ast.temAgregacaoLocal).toBe(true);
  expect(ast.colunas[1]).toMatchObject({ isAggregate: true, isStar: false });
  expect(ast.colunas[1]!.expr).toContain("COUNT_BIG(");
});

it("conserva escopo e recusa fanout mesmo com COUNT_BIG no denominador", () => {
  expect(() =>
    validateSourceSql("SELECT COUNT_BIG(v.segredo) AS n FROM vendas v", "mssql", scope),
  ).toThrow(expect.objectContaining({ code: "COLUNA_FORA_DO_ESCOPO" }));
  for (const expr of [
    "COUNT_BIG(v.id)",
    "SUM(v.valor)/NULLIF(COUNT_BIG(v.id),0)",
    "COUNT_BIG(*)",
  ]) {
    const ast = parseSelect(
      `SELECT ${expr} AS n FROM vendas v JOIN itens i ON i.venda=v.id`,
      "mssql",
    );
    expect(() => assertFanoutSeguro(ast, scope)).toThrow(
      expect.objectContaining({ code: "AGREGACAO_INSEGURA" }),
    );
  }
});

it("preserva literais e identificadores e não habilita UDF, escrita ou outros dialetos", () => {
  const sql =
    "SELECT 'COUNT_BIG(*)' AS texto, v.[COUNT_BIG(*)] AS nome FROM vendas v /* COUNT_BIG(*) */";
  const ast = parseSelect(sql, "mssql");
  expect(ast.sql).toBe(sql);
  expect(ast.temAgregacao).toBe(false);
  expect(ast.colunas[1]!.refs).toContainEqual({ table: "v", column: "COUNT_BIG(*)" });
  for (const invalid of [
    "SELECT dbo.COUNT_BIG(*) FROM vendas v",
    "SELECT COUNT_BIG(*) INTO copia FROM vendas v",
    "SELECT COUNT_BIG(*) FROM vendas v; DELETE FROM vendas",
  ])
    expect(() => parseSelect(invalid, "mssql")).toThrow();
  for (const dialect of ["postgres", "sybase", "firebird"] as const)
    expect(() => parseSelect("SELECT COUNT_BIG(v.id) FROM vendas v", dialect)).toThrow();
});

it("mantém janela como janela, CTE agregada e recusa argumentos inválidos", () => {
  expect(
    parseSelect("SELECT COUNT_BIG(v.id) OVER() AS n FROM vendas v", "mssql").colunas[0]!
      .isAggregate,
  ).toBe(false);
  const ast = parseSelect(
    "WITH c AS (SELECT COUNT_BIG(v.id) AS n FROM vendas v) SELECT c.n FROM c",
    "mssql",
  );
  expect(ast.subqueries.some((s) => s.temAgregacaoLocal)).toBe(true);
  for (const sql of [
    "SELECT COUNT_BIG() FROM vendas v",
    "SELECT COUNT_BIG(v.id,v.valor) FROM vendas v",
    "SELECT COUNT_BIG(DISTINCT v.id) FROM vendas v",
  ])
    expect(() => parseSelect(sql, "mssql")).toThrow();
  for (const text of [
    "'COUNT_BIG(*)'",
    '"COUNT_BIG(*)"',
    "[COUNT_BIG(*)]",
    "-- COUNT_BIG(*)\r",
    "/* COUNT_BIG(*) */",
  ])
    expect(normalizeParserCountBig(text)).toBe(text);
});
