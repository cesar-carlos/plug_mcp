import type { ManagedIntegration } from "../../../src/domain/persona-v2/integration-management";

export type IntegrationManagementAction = "suspender" | "recuperar" | "rotacionar" | "criar";
export type IntegrationManagementMode = IntegrationManagementAction | "";
export type IntegrationCredentialType = "bearer" | "api_key" | "basic";

export interface IntegrationManagementForm {
  name: string;
  kind: "rest" | "mcp_http";
  destination: string;
  ownerEmail: string;
  ownerPassword: string;
  type: IntegrationCredentialType;
  token: string;
  header: string;
  apiKey: string;
  username: string;
  password: string;
}

export type IntegrationCredentialPayload =
  | { credentialType: "bearer"; token: string }
  | { credentialType: "api_key"; header: string; apiKey: string }
  | { credentialType: "basic"; username: string; password: string };

export function emptyIntegrationManagementForm(): IntegrationManagementForm {
  return {
    name: "",
    kind: "rest",
    destination: "",
    ownerEmail: "",
    ownerPassword: "",
    type: "bearer",
    token: "",
    header: "",
    apiKey: "",
    username: "",
    password: "",
  };
}

export function clearIntegrationManagementSecrets(form: IntegrationManagementForm): void {
  form.ownerPassword = "";
  form.token = "";
  form.apiKey = "";
  form.password = "";
  form.username = "";
}

export function resetIntegrationManagementForm(form: IntegrationManagementForm): void {
  clearIntegrationManagementSecrets(form);
  form.ownerEmail = "";
  form.name = "";
  form.kind = "rest";
  form.destination = "";
  form.header = "";
  form.username = "";
  form.type = "bearer";
}

export function isIntegrationManagementDirty(
  mode: IntegrationManagementMode,
  confirmed: boolean,
  form: IntegrationManagementForm,
): boolean {
  return (
    !!mode ||
    confirmed ||
    Object.entries(form).some(([key, value]) => key !== "type" && key !== "kind" && !!value)
  );
}

export function integrationManagementStatus(
  row: Pick<ManagedIntegration, "suspendedAt" | "active">,
): string {
  return row.suspendedAt ? "suspensa" : row.active ? "ativa localmente" : "aguarda publicação";
}

export function integrationCredentialPayload(
  form: IntegrationManagementForm,
): IntegrationCredentialPayload {
  if (form.type === "bearer") {
    return { credentialType: "bearer", token: form.token };
  }
  if (form.type === "api_key") {
    return { credentialType: "api_key", header: form.header, apiKey: form.apiKey };
  }
  return { credentialType: "basic", username: form.username, password: form.password };
}

export function integrationManagementActionPath(
  root: string,
  connectionId: string,
  action: Exclude<IntegrationManagementAction, "criar">,
): string {
  return `${root}/${connectionId}/${action === "rotacionar" ? "credenciais" : action}`;
}

export function integrationManagementSubmitLabel(mode: IntegrationManagementAction): string {
  if (mode === "criar") {
    return "Confirmar cadastro da integração";
  }
  if (mode === "rotacionar") {
    return "Confirmar rotação de credenciais";
  }
  if (mode === "suspender") {
    return "Confirmar suspensão da integração";
  }
  return "Confirmar recuperação da integração";
}

export function integrationManagementConfirmLabel(mode: IntegrationManagementAction): string {
  return mode === "criar"
    ? "Revisei destino e credenciais e confirmo o cadastro sem operações ativas."
    : "Revisei o impacto e confirmo esta mudança da integração.";
}

export function integrationManagementSavedMessage(
  action: Exclude<IntegrationManagementAction, "criar">,
): string {
  if (action === "rotacionar") {
    return "Credencial rotacionada. Integração e operações permanecem desativadas; revise e publique nova skill/operação.";
  }
  if (action === "suspender") {
    return "Integração suspensa. Isso não cancela chamadas já enviadas nem prova rollback.";
  }
  return "Suspensão removida. Publicações e concessões antigas não foram restauradas; uma nova publicação continua necessária.";
}
