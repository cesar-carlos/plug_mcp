import { describe, expect, it } from "vitest";
import {
  parseSelect,
  parserDatabaseForDialeto,
  tryParseSelect,
} from "../../src/application/use-cases/shared/sql-ast.js";
import { ERROR_CODES } from "../../src/domain/errors/error-codes.js";
import { DomainError } from "../../src/domain/errors/domain-error.js";

describe("sql-ast", () => {
  it("mapeia mssql e sybase para transactsql", () => {
    expect(parserDatabaseForDialeto("mssql")).toBe("transactsql");
    expect(parserDatabaseForDialeto("sybase")).toBe("transactsql");
    expect(parserDatabaseForDialeto("postgres")).toBe("postgresql");
  });

  it("recusa firebird no caminho de SQL livre", () => {
    expect(() => parserDatabaseForDialeto("firebird")).toThrow(
      expect.objectContaining({
        code: ERROR_CODES.DIALECT_UNSUPPORTED,
        source: "sql",
        hint: expect.stringMatching(/n[aã]o reenvie SQL livre/i),
      }),
    );
    try {
      parserDatabaseForDialeto("firebird");
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      const json = (error as DomainError).toJson();
      expect(json.error.nextAction).toBe("inspecionar_consulta");
      expect(json.error.nextAction).not.toBe("consultar_dados");
    }
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

  it("percorre ramos de UNION ALL", () => {
    const ast = parseSelect(
      "SELECT p.codprod FROM produto p WHERE p.codprod = 1 UNION ALL SELECT f.valor FROM fatura f WHERE f.valor = 1",
      "mssql",
    );
    expect(ast.setOp).toMatch(/union/);
    expect(ast.setBranches.length).toBe(1);
    expect(ast.tabelas.some((tabela) => tabela.nome.toLowerCase() === "produto")).toBe(true);
    expect(
      ast.setBranches[0]?.tabelas.some((tabela) => tabela.nome.toLowerCase() === "fatura"),
    ).toBe(true);
  });

  it("coleta subquery em HAVING e JOIN ON", () => {
    const having = parseSelect(
      "SELECT p.codprod, SUM(p.codprod) AS total FROM produto p WHERE p.codprod > 0 GROUP BY p.codprod HAVING SUM(p.codprod) > (SELECT MAX(f.valor) FROM fatura f WHERE f.valor > 0)",
      "mssql",
    );
    expect(
      having.subqueries.some((sub) => sub.tabelas.some((t) => t.nome.toLowerCase() === "fatura")),
    ).toBe(true);
  });

  it("recusa INSERT com INVALID_SQL e source sql", () => {
    expect(() => parseSelect("INSERT INTO produto (codprod) VALUES (1)", "mssql")).toThrow(
      expect.objectContaining({
        code: ERROR_CODES.INVALID_SQL,
        source: "sql",
      }),
    );
  });
});
