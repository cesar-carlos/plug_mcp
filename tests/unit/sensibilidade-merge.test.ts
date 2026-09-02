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

  it("segundo merge de perfil não reescreve classe depois da origem virar validado_execucao", () => {
    expect(
      sensibilidadeAposMerge({
        existenteOrigem: "validado_execucao",
        existenteSensibilidade: "livre",
        incomingOrigem: "validado_execucao",
        incomingSensibilidade: "pessoal",
      }),
    ).toBe("livre");
  });
});
