import { describe, expect, it } from "vitest";
import { matchesSearch } from "./list-search";
describe("busca local", () => {
  it("ignora acentos e caixa, combina palavras e aceita busca vazia", () => {
    expect(matchesSearch("  ACAO fiscal ", "Ação", "Fiscal")).toBe(true);
    expect(matchesSearch("fiscal ausente", "Fiscal")).toBe(false);
    expect(matchesSearch("  ", "Qualquer nome")).toBe(true);
  });
});
