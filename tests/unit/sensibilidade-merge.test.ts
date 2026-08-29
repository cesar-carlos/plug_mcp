import { describe, expect, it } from "vitest";
import { sensibilidadeAposMerge } from "../../src/domain/entities/merge-fato.js";

describe("sensibilidadeAposMerge", () => {
  it("preserva classe confirmada quando o perfil enriquece", () => {
    expect(
      sensibilidadeAposMerge({
        existenteOrigem: "confirmado_usuario",
        existenteSensibilidade: "pessoal",
        incomingOrigem: "validado_execucao",
        incomingSensibilidade: "livre",
      }),
    ).toBe("pessoal");
  });

  it("aceita nova classe quando o usuário confirma de novo", () => {
    expect(
      sensibilidadeAposMerge({
        existenteOrigem: "confirmado_usuario",
        existenteSensibilidade: "livre",
        incomingOrigem: "confirmado_usuario",
        incomingSensibilidade: "segredo",
      }),
    ).toBe("segredo");
  });
});
