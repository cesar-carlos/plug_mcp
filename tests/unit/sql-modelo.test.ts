import { describe, expect, it } from "vitest";
import {
  bindNamedParams,
  extractNamedParams,
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
      extractNamedParams("SELECT p.codprod FROM produto p WHERE p.codprod = :codigo AND p.nome <> ':x'"),
    ).toEqual(["codigo"]);
    expect(extractNamedParams("SELECT p.codprod FROM produto p WHERE p.codprod = @codigo")).toEqual([
      "codigo",
    ]);
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
});
