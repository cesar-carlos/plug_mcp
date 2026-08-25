import { describe, expect, it } from "vitest";
import {
  parseSelect,
  parserDatabaseForDialeto,
  tryParseSelect,
} from "../../src/application/use-cases/shared/sql-ast.js";
import { ERROR_CODES } from "../../src/domain/errors/error-codes.js";

describe("sql-ast", () => {
  it("mapeia mssql e sybase para transactsql", () => {
    expect(parserDatabaseForDialeto("mssql")).toBe("transactsql");
    expect(parserDatabaseForDialeto("sybase")).toBe("transactsql");
    expect(parserDatabaseForDialeto("postgres")).toBe("postgresql");
  });

  it("recusa firebird no caminho de SQL livre", () => {
    expect(() => parserDatabaseForDialeto("firebird")).toThrow(
      expect.objectContaining({ code: ERROR_CODES.DIALECT_UNSUPPORTED }),
    );
  });

  it("detecta agregação, where, join e estrela em subquery", () => {
    const ast = parseSelect(
      "SELECT p.codprod, SUM(i.qtd) AS total FROM pedido p INNER JOIN item i ON i.pedido = p.codigo WHERE p.codprod > 0 GROUP BY p.codprod ORDER BY total",
      "mssql",
    );
    expect(ast.temAgregacao).toBe(true);
    expect(ast.temWhere).toBe(true);
    expect(ast.temGroupBy).toBe(true);
    expect(ast.groupByRefs.some((ref) => ref.column.toLowerCase() === "codprod")).toBe(true);
    expect(ast.temOrderBy).toBe(true);
    expect(ast.joins.length).toBe(1);
    const star = tryParseSelect("SELECT * FROM (SELECT p.codprod FROM produto p) x");
    expect(star?.temStar).toBe(true);
  });

  it("trata OVER como agregação e coleta colunas da janela", () => {
    for (const dialeto of ["mssql", "sybase", "postgres"] as const) {
      const ast = parseSelect(
        "SELECT SUM(t.valor) OVER (PARTITION BY t.empresa ORDER BY t.data) AS total FROM titulo t",
        dialeto,
      );
      expect(ast.temAgregacao).toBe(true);
      const cols = ast.filtroRefs.map((ref) => ref.column.toLowerCase());
      expect(cols).toEqual(expect.arrayContaining(["valor", "empresa", "data"]));
      const rowNumber = parseSelect(
        "SELECT ROW_NUMBER() OVER (PARTITION BY t.empresa ORDER BY t.data) AS rn FROM titulo t",
        dialeto,
      );
      expect(rowNumber.temAgregacao).toBe(true);
    }
  });
});
