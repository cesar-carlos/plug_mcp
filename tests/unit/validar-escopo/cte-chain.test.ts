import { describe, expect, it } from "vitest";
import { validarSqlNoEscopo } from "../../../src/application/use-cases/shared/validar-escopo.js";
import { escopoFromSqlModelo } from "../../../src/application/use-cases/shared/escopo-from-modelo.js";
import { parseSqlModelo } from "../../../src/application/use-cases/shared/sql-modelo.js";
import { resolvePhysicalJoinKey } from "../../../src/application/use-cases/shared/assert-fanout.js";
import { parseSelect } from "../../../src/application/use-cases/shared/sql-ast.js";

const scope = escopoFromSqlModelo(
  parseSqlModelo(
    "SELECT p.codprod, p.codcli, c.nome FROM produto p INNER JOIN cliente c ON c.codcli = p.codcli",
  ),
);
const chain = `WITH primeira AS (SELECT p.codprod, p.codcli FROM produto p),
 segunda AS (SELECT a.codprod, a.codcli FROM primeira a),
 terceira AS (SELECT b.codprod, b.codcli FROM segunda b)
 SELECT c.nome, SUM(t.codprod) AS total FROM terceira t
 INNER JOIN cliente c ON c.codcli = t.codcli GROUP BY c.nome`;

describe("linhagem de CTEs encadeadas", () => {
  it.each(["mssql", "postgres", "sybase"] as const)("preserva origem física em %s", (dialect) => {
    const ast = validarSqlNoEscopo(chain, dialect, scope);
    expect(resolvePhysicalJoinKey(ast.tabelas[0], "codcli")).toEqual({
      table: "produto",
      column: "codcli",
    });
  });
  it("preserva contexto em derivada e ramos UNION", () => {
    const sql = `WITH primeira AS (SELECT p.codprod, p.codcli FROM produto p)
      SELECT d.codprod FROM (SELECT a.codprod FROM primeira a) d WHERE d.codprod > 0
      UNION ALL SELECT b.codprod FROM primeira b WHERE b.codprod > 0`;
    expect(() => validarSqlNoEscopo(sql, "mssql", scope)).not.toThrow();
  });
  it("preserva todos os pares do relacionamento composto", () => {
    const composite = escopoFromSqlModelo(
      parseSqlModelo(
        "SELECT p.codprod, p.codcli, p.empresa, c.nome FROM produto p INNER JOIN cliente c ON c.codcli = p.codcli AND c.empresa = p.empresa",
      ),
    );
    const sql = `WITH primeira AS (SELECT p.codprod, p.codcli, p.empresa FROM produto p),
      segunda AS (SELECT a.codprod, a.codcli, a.empresa FROM primeira a)
      SELECT c.nome, SUM(b.codprod) AS total FROM segunda b
      JOIN cliente c ON c.codcli = b.codcli AND c.empresa = b.empresa GROUP BY c.nome`;
    expect(() => validarSqlNoEscopo(sql, "mssql", composite)).not.toThrow();
    expect(() =>
      validarSqlNoEscopo(sql.replace(" AND c.empresa = b.empresa", ""), "mssql", composite),
    ).toThrow();
  });
  it("recusa relacionamento não publicado através da cadeia", () => {
    expect(() =>
      validarSqlNoEscopo(
        chain.replace("c.codcli = t.codcli", "c.codcli = t.codprod"),
        "mssql",
        scope,
      ),
    ).toThrow();
  });
  it("não oculta tabela fora do escopo dentro da cadeia", () => {
    expect(() =>
      validarSqlNoEscopo(chain.replace("FROM produto p", "FROM privada p"), "mssql", scope),
    ).toThrow();
  });
  it("não autoriza coluna ausente na projeção intermediária", () => {
    expect(() =>
      validarSqlNoEscopo(
        chain.replace("SELECT a.codprod, a.codcli", "SELECT a.codprod"),
        "mssql",
        scope,
      ),
    ).toThrow();
  });
  it.each([
    "WITH a AS (SELECT x.codprod FROM a x) SELECT a.codprod FROM a",
    "WITH a AS (SELECT x.codprod FROM b x), b AS (SELECT p.codprod FROM produto p) SELECT a.codprod FROM a",
    "WITH a AS (SELECT p.codprod FROM produto p), a AS (SELECT p.codprod FROM produto p) SELECT a.codprod FROM a",
  ])("recusa definição cíclica, futura ou duplicada", (sql) => {
    expect(() => parseSelect(sql, "mssql")).toThrow();
  });
});
