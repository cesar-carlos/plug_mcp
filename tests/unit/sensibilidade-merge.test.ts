import { describe, expect, it } from "vitest";
import { mergeCamposColuna, sensibilidadeAposMerge } from "../../src/domain/entities/merge-fato.js";

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

  it("confirmação do dono aplica classe mesmo com origem validado_execucao", () => {
    expect(
      sensibilidadeAposMerge({
        existenteOrigem: "validado_execucao",
        existenteSensibilidade: "pessoal",
        incomingOrigem: "confirmado_usuario",
        incomingSensibilidade: "livre",
      }),
    ).toBe("livre");
  });
});

describe("mergeCamposColuna", () => {
  const existente = {
    origem: "validado_execucao" as const,
    status: "vigente" as const,
    descricao: null,
    dicionario: null,
    tipo: "varchar",
    formato: "text",
    nullable: true,
    papel: null,
    perfil: null,
    sensibilidade: "pessoal" as const,
  };

  it("confirmar_coluna livre vence validado_execucao na classe e na origem", () => {
    const merged = mergeCamposColuna(existente, {
      origem: "confirmado_usuario",
      sensibilidade: "livre",
    });
    expect(merged).not.toBeNull();
    expect(merged?.campos.sensibilidade).toBe("livre");
    expect(merged?.campos.origem).toBe("confirmado_usuario");
    expect(merged?.campos.tipo).toBe("varchar");
  });

  it("perfil depois da confirmação não rebaixa a classe", () => {
    const afterConfirm = mergeCamposColuna(existente, {
      origem: "confirmado_usuario",
      sensibilidade: "livre",
    });
    const afterProfile = mergeCamposColuna(afterConfirm!.campos, {
      origem: "validado_execucao",
      tipo: "varchar",
      formato: "text",
      sensibilidade: "pessoal",
    });
    expect(afterProfile?.campos.sensibilidade).toBe("livre");
    expect(afterProfile?.campos.origem).toBe("validado_execucao");
  });

  it("origem mais fraca sem classe confirmada continua no-op", () => {
    expect(
      mergeCamposColuna(existente, {
        origem: "confirmado_usuario",
        descricao: "Nome comercial",
      }),
    ).toBeNull();
  });
});

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
