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
  it("recusa tabela fora via CTE", () => {
    expect(() =>
      validarSqlNoEscopo(
        "WITH x AS (SELECT f.valor FROM fatura f) SELECT x.valor FROM x WHERE x.valor > 0",
        "mssql",
        escopo,
      ),
    ).toThrow(expect.objectContaining({ code: ERROR_CODES.TABELA_FORA_DO_ESCOPO }));
  });

  it("recusa coluna via subquery correlacionada", () => {
    expect(() =>
      validarSqlNoEscopo(
        "SELECT p.codprod FROM produto p WHERE EXISTS (SELECT 1 FROM cliente c WHERE c.fantasma = p.codprod)",
        "mssql",
        escopo,
      ),
    ).toThrow(expect.objectContaining({ code: ERROR_CODES.COLUNA_FORA_DO_ESCOPO }));
  });

  it("recusa JOIN inventado entre duas tabelas já no escopo", () => {
    expect(() =>
      validarSqlNoEscopo(
        "SELECT p.codprod, c.nome FROM produto p INNER JOIN cliente c ON c.nome = p.codprod WHERE p.codprod > 0",
        "mssql",
        escopo,
      ),
    ).toThrow(expect.objectContaining({ code: ERROR_CODES.JOIN_DESCONHECIDO }));
  });

  it("recusa segundo comando", () => {
    expect(() =>
      validarSqlNoEscopo(
        "SELECT p.codprod FROM produto p WHERE p.codprod > 0; DROP TABLE produto",
        "mssql",
        escopo,
      ),
    ).toThrow(expect.objectContaining({ code: ERROR_CODES.INVALID_SQL }));
  });

  it("recusa SELECT * aninhado", () => {
    expect(() =>
      validarSqlNoEscopo(
        "SELECT x.codprod FROM (SELECT * FROM produto) x WHERE x.codprod > 0",
        "mssql",
        escopo,
      ),
    ).toThrow(expect.objectContaining({ code: ERROR_CODES.INVALID_SQL }));
  });

  it("recusa mutação após comentário vazio", () => {
    expect(() =>
      validarSqlNoEscopo(
        "SELECT p.codprod FROM produto p WHERE p.codprod > 0; /* */ DROP TABLE produto",
        "mssql",
        escopo,
      ),
    ).toThrow(expect.objectContaining({ code: ERROR_CODES.INVALID_SQL }));
  });

  it("comentário -- INSERT não vira segundo comando", () => {
    const ast = validarSqlNoEscopo(
      "SELECT p.codprod FROM produto p WHERE p.codprod > 0 -- INSERT INTO produto",
      "mssql",
      escopo,
    );
    expect(ast.temWhere).toBe(true);
  });
});
