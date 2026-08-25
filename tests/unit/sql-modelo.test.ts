import { describe, expect, it } from "vitest";
import { escopoFromSqlModelo } from "../../src/application/use-cases/shared/escopo-from-modelo.js";
import {
  bindNamedParams,
  bindParamsForValidation,
  coerceBoundParams,
  columnQualifier,
  extractNamedParams,
  parseJoinEqualities,
  parseSqlModelo,
} from "../../src/application/use-cases/shared/sql-modelo.js";
import { DomainError } from "../../src/domain/errors/domain-error.js";
import { ERROR_CODES } from "../../src/domain/errors/error-codes.js";

describe("parseSqlModelo", () => {
  it("aceita SELECT nomeado com FROM", () => {
    const modelo = parseSqlModelo("SELECT p.codprod AS codigo, p.descricao FROM produto p");
    expect(modelo.tabelas.map((t) => t.nome.toLowerCase())).toContain("produto");
    expect(modelo.colunas.some((c) => c.alias.toLowerCase() === "codigo")).toBe(true);
  });

  it("rejeita SELECT *", () => {
    expect(() => parseSqlModelo("SELECT * FROM produto")).toThrow(DomainError);
  });

  it("rejeita várias tabelas sem JOIN", () => {
    expect(() => parseSqlModelo("SELECT a.id, b.id FROM a, b")).toThrow(DomainError);
  });

  it("aceita JOIN explícito", () => {
    const modelo = parseSqlModelo(
      "SELECT p.codprod, i.qtd FROM pedido p INNER JOIN item i ON i.pedido = p.codigo",
    );
    expect(modelo.relacionamentos.length).toBeGreaterThan(0);
    expect(modelo.tabelas.length).toBeGreaterThanOrEqual(2);
  });

  it("rejeita segundo comando", () => {
    expect(() =>
      parseSqlModelo("SELECT p.codprod AS codigo FROM produto p; DELETE FROM produto"),
    ).toThrow(DomainError);
  });

  it("extrai placeholders :nome e @nome fora de literais", () => {
    expect(
      extractNamedParams(
        "SELECT p.codprod FROM produto p WHERE p.codprod = :codigo AND p.nome <> ':x'",
      ),
    ).toEqual(["codigo"]);
    expect(extractNamedParams("SELECT p.codprod FROM produto p WHERE p.codprod = @codigo")).toEqual(
      ["codigo"],
    );
  });

  it("bindNamedParams exige params presentes", () => {
    try {
      bindNamedParams("SELECT p.codprod FROM produto p WHERE p.codprod = :codigo", {});
      expect.fail("deveria lançar");
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe(ERROR_CODES.VALIDATION_ERROR);
    }
    expect(
      bindNamedParams("SELECT p.codprod FROM produto p WHERE p.codprod = :codigo", { codigo: 1 }),
    ).toEqual({ codigo: 1 });
  });

  it("rejeita expressão sem AS", () => {
    expect(() => parseSqlModelo("SELECT SUM(qtd) FROM item")).toThrow(DomainError);
    try {
      parseSqlModelo("SELECT p.preco * p.qtd FROM produto p");
      expect.fail("deveria lançar");
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe(ERROR_CODES.INVALID_SQL);
    }
    const modelo = parseSqlModelo("SELECT SUM(qtd) AS total FROM item");
    expect(modelo.colunas.some((c) => c.alias.toLowerCase() === "total")).toBe(true);
  });

  it("rejeita coluna sem qualificador quando há JOIN", () => {
    expect(() =>
      parseSqlModelo(
        "SELECT codprod, nome FROM produto p INNER JOIN cliente c ON c.codcli = p.codcli",
      ),
    ).toThrow(DomainError);
  });

  it("aceita expressão com AS mesmo em JOIN", () => {
    const modelo = parseSqlModelo(
      "SELECT p.codprod, SUM(i.qtd) AS total FROM pedido p INNER JOIN item i ON i.pedido = p.codigo GROUP BY p.codprod",
    );
    expect(modelo.colunas.some((c) => c.alias.toLowerCase() === "total")).toBe(true);
  });

  it("extrai igualdades do ON e o qualificador da coluna", () => {
    const modelo = parseSqlModelo(
      "SELECT p.codprod, c.nome FROM produto p INNER JOIN cliente c ON c.codcli = p.codcli",
    );
    expect(parseJoinEqualities(modelo.relacionamentos[0]?.on)).toEqual([
      { leftAlias: "c", leftColumn: "codcli", rightAlias: "p", rightColumn: "codcli" },
    ]);
    expect(columnQualifier("p.codprod")).toBe("p");
    expect(columnQualifier("SUM(p.qtd)")).toBeNull();
  });

  it("bindParamsForValidation preenche ausentes com null", () => {
    expect(
      bindParamsForValidation("SELECT p.codprod FROM produto p WHERE p.codprod = :codigo", {}),
    ).toEqual({ codigo: null });
    expect(
      bindParamsForValidation("SELECT p.codprod FROM produto p WHERE p.codprod = :codigo", {
        codigo: 10,
      }),
    ).toEqual({ codigo: 10 });
  });

  it("rejeita JOIN sem igualdade no ON", () => {
    expect(() =>
      parseSqlModelo("SELECT p.codprod, c.nome FROM produto p INNER JOIN cliente c ON 1 = 1"),
    ).toThrow(DomainError);
    try {
      parseSqlModelo("SELECT p.codprod, c.nome FROM produto p INNER JOIN cliente c ON 1 = 1");
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe(ERROR_CODES.INVALID_SQL);
    }
  });

  it("aceita CROSS JOIN sem exigir ON", () => {
    const modelo = parseSqlModelo("SELECT p.codprod, c.nome FROM produto p CROSS JOIN cliente c");
    expect(modelo.relacionamentos.some((rel) => rel.tipoJoin.includes("cross"))).toBe(true);
  });

  it("bind recusa number com string não numérica", () => {
    expect(() =>
      coerceBoundParams({ codigo: "abc" }, [
        { nome: "codigo", descricao: "Código", obrigatorio: true, tipo: "number" },
      ]),
    ).toThrow(DomainError);
  });
});

describe("escopoFromSqlModelo grao", () => {
  it("usa GROUP BY quando houver agregação", () => {
    const escopo = escopoFromSqlModelo(
      parseSqlModelo(
        "SELECT p.codprod, SUM(p.codprod) AS total FROM produto p WHERE p.codprod > 0 GROUP BY p.codprod",
      ),
    );
    expect(escopo.grao.map((item) => item.toLowerCase())).toContain("codprod");
  });

  it("usa colunas físicas do SELECT sem agregação", () => {
    const escopo = escopoFromSqlModelo(
      parseSqlModelo("SELECT p.codprod AS codigo, p.descricao FROM produto p"),
    );
    expect(escopo.grao.map((item) => item.toLowerCase())).toEqual(
      expect.arrayContaining(["codprod", "descricao"]),
    );
  });
});
