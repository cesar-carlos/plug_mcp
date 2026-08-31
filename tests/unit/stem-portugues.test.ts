import { describe, expect, it } from "vitest";
import {
  scoreStemOverlap,
  stemPortugues,
  stemsDeTexto,
  stripAccents,
} from "../../src/domain/entities/stem-portugues.js";

describe("stemPortugues", () => {
  it("une inflexão titulo / titulos no mesmo stem (ouro cobertura)", () => {
    expect(stemPortugues("titulo")).toBe(stemPortugues("titulos"));
    expect(stemPortugues("titulo").length).toBeGreaterThanOrEqual(4);
  });

  it("une margem / margens (plural nasal)", () => {
    expect(stemPortugues("margem")).toBe(stemPortugues("margens"));
  });

  it("stripAccents normaliza", () => {
    expect(stripAccents("título")).toBe("titulo");
  });

  it("scoreStemOverlap casa membership de stem, não prefixo curto", () => {
    const stemsTitulo = stemsDeTexto("titulo");
    expect(scoreStemOverlap("titulo da conta", stemsTitulo)).toBeGreaterThan(0);
    expect(scoreStemOverlap("titularidade", stemsTitulo)).toBe(0);
  });

  it("stemsDeTexto ignora stop extra", () => {
    const stems = stemsDeTexto(
      "tente fazer a consulta agora com titulo",
      new Set(["tente", "fazer", "consulta"]),
    );
    expect(stems.some((s) => s.startsWith("titul"))).toBe(true);
    expect(stems).not.toContain("tent");
  });
});
