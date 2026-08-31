import { describe, expect, it } from "vitest";
import {
  coletarAvisosValidacao,
  exigirPaginacaoEstavel,
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
        pageSize: 10,
      }),
    ).toThrow(expect.objectContaining({ code: ERROR_CODES.VALIDATION_ERROR }));
  });

  it("não recusa TOP quando só page vem (não pagina de verdade)", () => {
    const ast = validarSqlNoEscopo(
      "SELECT TOP 10 p.codprod FROM produto p WHERE p.codprod > 0 ORDER BY p.codprod",
      "mssql",
      escopo,
      { page: 2 },
    );
    expect(ast.temLimite).toBe(true);
  });

  it("recusa paginação com TOP no SQL", () => {
    expect(() =>
      validarSqlNoEscopo(
        "SELECT TOP 10 p.codprod FROM produto p WHERE p.codprod > 0 ORDER BY p.codprod",
        "mssql",
        escopo,
        { page: 2, pageSize: 10 },
      ),
    ).toThrow(
      expect.objectContaining({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: expect.stringMatching(/TOP\/LIMIT\/FIRST/i),
      }),
    );
  });

  it("recusa paginação com LIMIT no SQL", () => {
    expect(() =>
      validarSqlNoEscopo(
        "SELECT p.codprod FROM produto p WHERE p.codprod > 0 ORDER BY p.codprod LIMIT 10",
        "postgres",
        escopo,
        { page: 2, pageSize: 10 },
      ),
    ).toThrow(
      expect.objectContaining({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: expect.stringMatching(/TOP\/LIMIT\/FIRST/i),
      }),
    );
  });

  it("recusa paginação com OFFSET FETCH no SQL", () => {
    expect(() =>
      validarSqlNoEscopo(
        "SELECT p.codprod FROM produto p WHERE p.codprod > 0 ORDER BY p.codprod OFFSET 10 ROWS FETCH NEXT 10 ROWS ONLY",
        "mssql",
        escopo,
        { page: 2, pageSize: 10 },
      ),
    ).toThrow(
      expect.objectContaining({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: expect.stringMatching(/TOP\/LIMIT\/FIRST/i),
      }),
    );
  });

  it("recusa paginação com START AT no SQL", () => {
    expect(() =>
      exigirPaginacaoEstavel(
        "SELECT p.codprod FROM produto p WHERE p.codprod > 0 ORDER BY p.codprod START AT 11",
        null,
        { page: 2, pageSize: 10 },
      ),
    ).toThrow(
      expect.objectContaining({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: expect.stringMatching(/TOP\/LIMIT\/FIRST/i),
      }),
    );
  });

  it("aceita paginação com ORDER BY sem TOP/LIMIT", () => {
    const ast = validarSqlNoEscopo(
      "SELECT p.codprod FROM produto p WHERE p.codprod > 0 ORDER BY p.codprod",
      "mssql",
      escopo,
      { page: 2, pageSize: 10 },
    );
    expect(ast.temOrderBy).toBe(true);
    expect(ast.temLimite).toBe(false);
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

  it("modo inspecao aceita SELECT * de uma tabela sem recorte", () => {
    const ast = validarSqlNoEscopo("SELECT * FROM produto", "mssql", escopo, { modo: "inspecao" });
    expect(ast.temStar).toBe(true);
  });

  it("modo inspecao recusa SELECT * com JOIN", () => {
    expect(() =>
      validarSqlNoEscopo(
        "SELECT * FROM produto p INNER JOIN cliente c ON c.codcli = p.codcli",
        "mssql",
        escopo,
        { modo: "inspecao" },
      ),
    ).toThrow(expect.objectContaining({ code: ERROR_CODES.INVALID_SQL }));
  });

  it("consulta continua recusando SELECT * e sem recorte", () => {
    expect(() => validarSqlNoEscopo("SELECT * FROM produto", "mssql", escopo)).toThrow(
      expect.objectContaining({ code: ERROR_CODES.INVALID_SQL }),
    );
    expect(() => validarSqlNoEscopo("SELECT p.codprod FROM produto p", "mssql", escopo)).toThrow(
      expect.objectContaining({ code: ERROR_CODES.CONSULTA_SEM_RECORTE }),
    );
  });
});
