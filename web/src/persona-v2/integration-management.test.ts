import { describe, expect, it } from "vitest";
import {
  emptyIntegrationManagementForm,
  integrationCredentialPayload,
  integrationManagementActionPath,
  integrationManagementConfirmLabel,
  integrationManagementSavedMessage,
  integrationManagementStatus,
  integrationManagementSubmitLabel,
  isIntegrationManagementDirty,
  resetIntegrationManagementForm,
} from "./integration-management";

describe("gestão de integrações no console", () => {
  it("não marca rascunho vazio; tipo e natureza sozinhos não sujam", () => {
    const form = emptyIntegrationManagementForm();
    expect(isIntegrationManagementDirty("", false, form)).toBe(false);
    form.kind = "mcp_http";
    form.type = "basic";
    expect(isIntegrationManagementDirty("", false, form)).toBe(false);
    expect(isIntegrationManagementDirty("criar", false, form)).toBe(true);
    expect(isIntegrationManagementDirty("", true, form)).toBe(true);
    form.name = "ERP";
    expect(isIntegrationManagementDirty("", false, form)).toBe(true);
  });

  it("distingue estado local sem tratar destino remoto como disponível", () => {
    expect(integrationManagementStatus({ suspendedAt: "2026-01-01", active: true })).toBe(
      "suspensa",
    );
    expect(integrationManagementStatus({ suspendedAt: null, active: true })).toBe(
      "ativa localmente",
    );
    expect(integrationManagementStatus({ suspendedAt: null, active: false })).toBe(
      "aguarda publicação",
    );
  });

  it("monta credencial e caminho da ação sem executar o provedor", () => {
    const form = emptyIntegrationManagementForm();
    form.token = "secret";
    expect(integrationCredentialPayload(form)).toEqual({
      credentialType: "bearer",
      token: "secret",
    });
    form.type = "api_key";
    form.header = "X-Key";
    form.apiKey = "k";
    expect(integrationCredentialPayload(form)).toEqual({
      credentialType: "api_key",
      header: "X-Key",
      apiKey: "k",
    });
    form.type = "basic";
    form.username = "bot";
    form.password = "pw";
    expect(integrationCredentialPayload(form)).toEqual({
      credentialType: "basic",
      username: "bot",
      password: "pw",
    });
    expect(integrationManagementActionPath("/gestao", "id-1", "rotacionar")).toBe(
      "/gestao/id-1/credenciais",
    );
    expect(integrationManagementActionPath("/gestao", "id-1", "suspender")).toBe(
      "/gestao/id-1/suspender",
    );
  });

  it("preserva textos de confirmação e limpa só campos da jornada", () => {
    expect(integrationManagementSubmitLabel("criar")).toBe("Confirmar cadastro da integração");
    expect(integrationManagementSubmitLabel("recuperar")).toBe(
      "Confirmar recuperação da integração",
    );
    expect(integrationManagementConfirmLabel("criar")).toContain("sem operações ativas");
    expect(integrationManagementSavedMessage("suspender")).toContain("não cancela");
    const form = emptyIntegrationManagementForm();
    form.name = "A";
    form.token = "x";
    form.kind = "mcp_http";
    resetIntegrationManagementForm(form);
    expect(form).toEqual(emptyIntegrationManagementForm());
  });
});
