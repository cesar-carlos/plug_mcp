import pg from "pg";
import { describe, expect, it } from "vitest";
import { parseEscopoSkill } from "../../src/domain/entities/escopo.js";
import { validarSqlNoEscopo } from "../../src/application/use-cases/shared/validar-escopo.js";
import { assertFanoutSeguro } from "../../src/application/use-cases/shared/assert-fanout.js";
import { exigirFiltroEscopoPadrao } from "../../src/application/use-cases/shared/escopo-filtro.js";

const scope = parseEscopoSkill({
  tabelas: ["pedido", "item"],
  colunasPorTabela: {
    pedido: ["id", "empresa", "valor", "data"],
    item: ["pedido", "empresa", "valor"],
  },
  relacionamentos: [
    {
      tabelaOrigem: "pedido",
      tabelaDestino: "item",
      colunaOrigem: "id",
      colunaDestino: "pedido",
      pares: [
        { colunaOrigem: "id", colunaDestino: "pedido" },
        { colunaOrigem: "empresa", colunaDestino: "empresa" },
      ],
      cardinalidade: "1:N",
      tipoJoin: "left",
    },
  ],
});
const params: Record<string, unknown> = { empresa: "A", desde: "2026-01-02", ate: "2026-01-03" };
const cases = [
  {
    name: "pré-agregação preserva registros com valores iguais",
    sql: "SELECT SUM(p.valor) total FROM pedido p JOIN (SELECT i.pedido,i.empresa,SUM(i.valor) total FROM item i WHERE i.empresa=:empresa GROUP BY i.pedido,i.empresa) x ON p.id=x.pedido AND p.empresa=x.empresa WHERE p.empresa=:empresa",
    rows: [{ total: 20 }],
  },
  {
    name: "EXISTS não multiplica medidas",
    sql: "SELECT SUM(p.valor) total FROM pedido p WHERE p.empresa=:empresa AND EXISTS (SELECT i.pedido FROM item i WHERE i.pedido=p.id AND i.empresa=p.empresa AND i.empresa=:empresa)",
    rows: [{ total: 20 }],
  },
  {
    name: "medida no grão filho mantém SUM e AVG",
    sql: "SELECT SUM(i.valor) total,ROUND(AVG(i.valor),2) media FROM pedido p JOIN item i ON p.id=i.pedido AND p.empresa=i.empresa WHERE p.empresa=:empresa AND i.empresa=:empresa",
    rows: [{ total: 20, media: 6.67 }],
  },
  {
    name: "LEFT pré-agregado preserva pai sem filho e valor nulo",
    sql: "SELECT COUNT(p.id) quantidade,SUM(p.valor) total FROM pedido p LEFT JOIN (SELECT i.pedido,i.empresa,SUM(i.valor) total FROM item i WHERE i.empresa=:empresa GROUP BY i.pedido,i.empresa) x ON p.id=x.pedido AND p.empresa=x.empresa WHERE p.empresa=:empresa",
    rows: [{ quantidade: 3, total: 20 }],
  },
  {
    name: "datas usam parâmetros e isolam empresas",
    sql: "SELECT p.id FROM pedido p WHERE p.empresa=:empresa AND p.data>=:desde AND p.data<:ate ORDER BY p.data,p.id",
    rows: [{ id: 2 }, { id: 3 }],
  },
  {
    name: "paginação ordenada desempata por chave física",
    sql: "SELECT p.id FROM pedido p WHERE p.empresa=:empresa ORDER BY p.data,p.id LIMIT 1 OFFSET 1",
    rows: [{ id: 2 }],
  },
  {
    name: "listagem sem dados devolve vazio",
    sql: "SELECT p.id FROM pedido p WHERE p.empresa=:empresa AND p.data>:ate",
    rows: [],
  },
  {
    name: "agregação sem dados preserva null",
    sql: "SELECT SUM(p.valor) total FROM pedido p WHERE p.empresa=:empresa AND p.data>:ate",
    rows: [{ total: null }],
  },
];
const url = process.env.DATABASE_URL;
describe.skipIf(!url)("PostgreSQL: grão, datas, nulos e paginação", () => {
  it.each(cases)("$name", async ({ sql, rows }) => {
    const ast = validarSqlNoEscopo(sql, "postgres", scope);
    assertFanoutSeguro(ast, scope);
    exigirFiltroEscopoPadrao({
      sql,
      dialeto: "postgres",
      colunasDasTabelas: scope.colunasPorTabela,
      escopoPadrao: {
        empresa: "A",
        bindings: [
          { tabela: "pedido", coluna: "empresa", param: "empresa" },
          { tabela: "item", coluna: "empresa", param: "empresa" },
        ],
      },
    });
    const client = new pg.Client({ connectionString: url });
    await client.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "CREATE TEMP TABLE pedido(id integer,empresa text,valor numeric,data date) ON COMMIT DROP",
      );
      await client.query(
        "CREATE TEMP TABLE item(pedido integer,empresa text,valor numeric) ON COMMIT DROP",
      );
      await client.query(
        "INSERT INTO pedido VALUES(1,'A',10,'2026-01-01'),(2,'A',10,'2026-01-02'),(3,'A',NULL,'2026-01-02'),(1,'B',999,'2026-01-02')",
      );
      await client.query("INSERT INTO item VALUES(1,'A',3),(1,'A',7),(2,'A',10),(1,'B',999)");
      const names: string[] = [];
      const bound = sql.replace(/:(\w+)/g, (_match, name: string) => {
        names.push(name);
        return `$${names.length}`;
      });
      const result = await client.query<Record<string, string | null>>(
        bound,
        names.map((name) => params[name]),
      );
      expect(
        result.rows.map((row) =>
          Object.fromEntries(
            Object.entries(row).map(([key, value]) => [key, value === null ? null : Number(value)]),
          ),
        ),
      ).toEqual(rows);
    } finally {
      await client.query("ROLLBACK");
      await client.end();
    }
  });
  it("recusa SUM do pai no JOIN bruto e não usa DISTINCT como correção", () => {
    const sql =
      "SELECT SUM(p.valor) total FROM pedido p JOIN item i ON p.id=i.pedido AND p.empresa=i.empresa WHERE p.empresa=:empresa AND i.empresa=:empresa";
    for (const [expression, code] of [
      [sql, "AGREGACAO_INSEGURA"],
      [sql.replace("SUM(p.valor)", "SUM(DISTINCT p.valor)"), "INVALID_SQL"],
    ]) {
      expect(() =>
        assertFanoutSeguro(validarSqlNoEscopo(expression!, "postgres", scope), scope),
      ).toThrow(expect.objectContaining({ code }));
    }
  });
});
