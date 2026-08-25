import { describe, expect, it } from "vitest";
import {
  distanciaEdicao,
  hintComProximos,
  sugerirProximos,
} from "../../src/application/use-cases/shared/sugestoes.js";

describe("sugerirProximos", () => {
  it("sugere coluna próxima por distância de edição", () => {
    expect(sugerirProximos("CodVendedr", ["CodCliente", "CodVendedor", "UfMunicipio"])).toEqual([
      "CodVendedor",
    ]);
  });

  it("devolve vazio quando não há candidato perto", () => {
    expect(sugerirProximos("xyz", ["CodCliente", "SaldoReceber"])).toEqual([]);
  });

  it("hint lista alternativas quando não há match próximo", () => {
    expect(hintComProximos("Coluna inexistente.", "foo", ["CodCliente", "Status"])).toContain(
      "Disponíveis: CodCliente, Status.",
    );
  });

  it("distanciaEdicao é simétrica para o caso típico", () => {
    expect(distanciaEdicao("kitten", "sitting")).toBe(3);
  });
});
