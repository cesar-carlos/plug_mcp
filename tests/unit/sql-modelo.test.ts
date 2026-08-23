import { describe, expect, it } from "vitest";
import { parseSqlModelo } from "../../src/application/use-cases/shared/sql-modelo.js";
import { DomainError } from "../../src/domain/errors/domain-error.js";

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
});
