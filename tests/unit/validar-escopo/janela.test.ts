import { describe, expect, it } from "vitest";
import { validarSqlNoEscopo } from "../../../src/application/use-cases/shared/validar-escopo.js";
import { escopoFromSqlModelo } from "../../../src/application/use-cases/shared/escopo-from-modelo.js";
import { parseSqlModelo } from "../../../src/application/use-cases/shared/sql-modelo.js";
import { ERROR_CODES } from "../../../src/domain/errors/error-codes.js";

const escopo = escopoFromSqlModelo(
  parseSqlModelo("SELECT p.codprod, p.valor, p.empresa, p.data FROM produto p"),
);

describe("validarSqlNoEscopo janela", () => {
  it("aceita SUM OVER no escopo em mssql e postgres", () => {
    const sql =
      "SELECT SUM(p.valor) OVER (PARTITION BY p.empresa ORDER BY p.data) AS total FROM produto p";
    for (const dialeto of ["mssql", "postgres"] as const) {
      const ast = validarSqlNoEscopo(sql, dialeto, escopo);
      expect(ast.temAgregacao).toBe(true);
    }
  });

  it("recusa coluna só no PARTITION BY fora do escopo", () => {
    expect(() =>
      validarSqlNoEscopo(
        "SELECT SUM(p.valor) OVER (PARTITION BY p.fantasma ORDER BY p.data) AS total FROM produto p",
        "mssql",
        escopo,
      ),
    ).toThrow(expect.objectContaining({ code: ERROR_CODES.COLUNA_FORA_DO_ESCOPO }));
  });

  it("janela sem WHERE não dispara CONSULTA_SEM_RECORTE", () => {
    const ast = validarSqlNoEscopo(
      "SELECT ROW_NUMBER() OVER (PARTITION BY p.empresa ORDER BY p.data) AS rn FROM produto p",
      "mssql",
      escopo,
    );
    expect(ast.temAgregacao).toBe(true);
    expect(ast.temWhere).toBe(false);
  });
});
