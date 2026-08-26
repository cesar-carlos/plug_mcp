import { describe, expect, it } from "vitest";
import { validarSqlNoEscopo } from "../../../src/application/use-cases/shared/validar-escopo.js";
import { escopoFromSqlModelo } from "../../../src/application/use-cases/shared/escopo-from-modelo.js";
import { parseSqlModelo } from "../../../src/application/use-cases/shared/sql-modelo.js";
import { ERROR_CODES } from "../../../src/domain/errors/error-codes.js";

const escopo = escopoFromSqlModelo(
  parseSqlModelo(
    "SELECT p.codprod, c.nome FROM produto p INNER JOIN cliente c ON c.codcli = p.codcli",
  ),
);

describe("validarSqlNoEscopo adversarial", () => {
  it("recusa UNION ALL com tabela fora do escopo", () => {
    expect(() =>
      validarSqlNoEscopo(
        "SELECT p.codprod FROM produto p WHERE p.codprod = 1 UNION ALL SELECT f.valor FROM fatura f WHERE f.valor = 1",
        "mssql",
        escopo,
      ),
    ).toThrow(expect.objectContaining({ code: ERROR_CODES.TABELA_FORA_DO_ESCOPO }));
  });

  it("recusa INTERSECT com tabela fora do escopo", () => {
    expect(() =>
      validarSqlNoEscopo(
        "SELECT p.codprod FROM produto p WHERE p.codprod = 1 INTERSECT SELECT f.valor FROM fatura f WHERE f.valor = 1",
        "postgres",
        escopo,
      ),
    ).toThrow(expect.objectContaining({ code: ERROR_CODES.TABELA_FORA_DO_ESCOPO }));
  });

  it("recusa subquery em HAVING fora do escopo", () => {
    expect(() =>
      validarSqlNoEscopo(
        "SELECT p.codprod, SUM(p.codprod) AS total FROM produto p WHERE p.codprod > 0 GROUP BY p.codprod HAVING SUM(p.codprod) > (SELECT MAX(f.valor) FROM fatura f)",
        "mssql",
        escopo,
      ),
    ).toThrow(expect.objectContaining({ code: ERROR_CODES.TABELA_FORA_DO_ESCOPO }));
  });

  it("recusa alias desconhecido", () => {
    expect(() =>
      validarSqlNoEscopo("SELECT z.codprod FROM produto p WHERE z.codprod > 0", "mssql", escopo),
    ).toThrow(expect.objectContaining({ code: ERROR_CODES.ALIAS_DESCONHECIDO }));
  });

  it("recusa coluna sem qualificador com mais de uma tabela", () => {
    expect(() =>
      validarSqlNoEscopo(
        "SELECT codprod FROM produto p INNER JOIN cliente c ON c.codcli = p.codcli WHERE p.codprod > 0",
        "mssql",
        escopo,
      ),
    ).toThrow(expect.objectContaining({ code: ERROR_CODES.COLUNA_AMBIGUA }));
  });

  it("recusa paginação cujo ORDER BY está só em comentário", () => {
    expect(() =>
      validarSqlNoEscopo(
        "SELECT p.codprod FROM produto p WHERE p.codprod > 0 -- ORDER BY p.codprod",
        "mssql",
        escopo,
        { page: 2, pageSize: 10 },
      ),
    ).toThrow(
      expect.objectContaining({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: expect.stringMatching(/ORDER BY/i),
      }),
    );
  });

  it("recusa paginação cujo ORDER BY está só na subquery", () => {
    expect(() =>
      validarSqlNoEscopo(
        "SELECT p.codprod FROM produto p WHERE p.codprod IN (SELECT c.codcli FROM cliente c ORDER BY c.codcli) ",
        "mssql",
        escopo,
        { page: 2, pageSize: 10 },
      ),
    ).toThrow(
      expect.objectContaining({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: expect.stringMatching(/ORDER BY/i),
      }),
    );
  });
});
