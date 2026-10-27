import { describe, expect, it } from "vitest";
import { emptySourceForm, isSourceFormDirty } from "./source-form";

describe("formulário de cadastro de base", () => {
  it("começa vazio no ambiente e dialeto padrão", () => {
    expect(emptySourceForm()).toEqual({
      name: "",
      purpose: "",
      environment: "desenvolvimento",
      agentId: "",
      clientToken: "",
      email: "",
      password: "",
      dialect: "mssql",
    });
    expect(isSourceFormDirty(emptySourceForm(), false)).toBe(false);
  });
  it("marca edição por substituição ou campo preenchido, sem tratar credencial como persistida", () => {
    const form = emptySourceForm();
    expect(isSourceFormDirty(form, true)).toBe(true);
    form.name = "ERP";
    expect(isSourceFormDirty(form, false)).toBe(true);
  });
});
