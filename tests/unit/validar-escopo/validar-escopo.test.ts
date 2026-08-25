import { describe, expect, it } from "vitest";
import {
  coletarAvisosValidacao,
  GROUP_BY_MAX_EXPRESSIONS,
  validarSqlNoEscopo,
} from "../../../src/application/use-cases/shared/validar-escopo.js";
import { escopoFromSqlModelo } from "../../../src/application/use-cases/shared/escopo-from-modelo.js";
import { parseSqlModelo } from "../../../src/application/use-cases/shared/sql-modelo.js";
import { ERROR_CODES } from "../../../src/domain/errors/error-codes.js";

const escopo = escopoFromSqlModelo(
  parseSqlModelo(
    "SELECT p.codprod, c.nome FROM produto p INNER JOIN cliente c ON c.codcli = p.codcli",
  ),
);

describe("validarSqlNoEscopo", () => {
  it("aceita agregação no escopo", () => {
    const ast = validarSqlNoEscopo(
      "SELECT SUM(p.codprod) AS total FROM produto p WHERE p.codprod > 0",
      "mssql",
      escopo,
    );
    expect(ast.temAgregacao).toBe(true);
  });

  it("recusa tabela fora", () => {
    expect(() =>
      validarSqlNoEscopo("SELECT f.valor FROM fatura f WHERE f.ano = 2026", "mssql", escopo),
    ).toThrow(expect.objectContaining({ code: ERROR_CODES.TABELA_FORA_DO_ESCOPO }));
  });

  it("recusa JOIN inventado", () => {
    expect(() =>
      validarSqlNoEscopo(
        "SELECT p.codprod, x.foo FROM produto p INNER JOIN alien x ON x.id = p.codprod WHERE p.codprod > 0",
        "mssql",
        escopo,
      ),
    ).toThrow(expect.objectContaining({ code: ERROR_CODES.TABELA_FORA_DO_ESCOPO }));
  });

  it("recusa SELECT sem recorte nem agregação", () => {
    expect(() => validarSqlNoEscopo("SELECT p.codprod FROM produto p", "mssql", escopo)).toThrow(
      expect.objectContaining({ code: ERROR_CODES.CONSULTA_SEM_RECORTE }),
    );
  });

  it("recusa paginação sem ORDER BY", () => {
    expect(() =>
      validarSqlNoEscopo("SELECT p.codprod FROM produto p WHERE p.codprod > 0", "mssql", escopo, {
        page: 2,
      }),
    ).toThrow(expect.objectContaining({ code: ERROR_CODES.VALIDATION_ERROR }));
  });

  it("recusa firebird no SQL livre", () => {
    expect(() =>
      validarSqlNoEscopo("SELECT p.codprod FROM produto p WHERE p.codprod > 0", "firebird", escopo),
    ).toThrow(expect.objectContaining({ code: ERROR_CODES.DIALECT_UNSUPPORTED }));
  });

  it("aviso de literal de texto no WHERE não é erro", () => {
    const ast = validarSqlNoEscopo(
      "SELECT SUM(p.codprod) AS total FROM produto p WHERE p.codprod = 'abc'",
      "mssql",
      escopo,
    );
    expect(coletarAvisosValidacao(ast).some((aviso) => aviso.code === "LITERAL_TEXTO")).toBe(true);
  });

  it("recusa GROUP BY acima do teto", () => {
    const exprs = Array.from(
      { length: GROUP_BY_MAX_EXPRESSIONS + 1 },
      (_, i) => `p.codprod + ${String(i)}`,
    );
    expect(() =>
      validarSqlNoEscopo(
        `SELECT COUNT(*) AS n FROM produto p WHERE p.codprod > 0 GROUP BY ${exprs.join(", ")}`,
        "mssql",
        escopo,
      ),
    ).toThrow(expect.objectContaining({ code: ERROR_CODES.VALIDATION_ERROR }));
  });
});
