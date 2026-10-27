export const consoleFieldLabels: Record<string, string> = {
  name: "Nome",
  specialty: "Especialidade",
  instructions: "Instruções",
  purpose: "Finalidade",
  environment: "Ambiente",
  agentId: "AGENT_ID",
  email: "E-mail",
  password: "Senha",
  clientToken: "CLIENT_TOKEN",
  dialect: "Dialeto",
  expectedVersion: "Versão do cadastro",
  slug: "Identificação",
  training: "Treinamento",
  permissions: "Permissões",
  delegation: "Delegação",
  expiresAt: "Validade",
  rowRestrictions: "Recortes obrigatórios",
};

/** Open collapsed ancestors and focus the refused field, or the area error summary. */
export function focusConsoleErrorField(area: string, field: string): void {
  const input = document.querySelector<HTMLElement>(`[data-error-field="${area}:${field}"]`);
  for (let parent = input?.parentElement; parent; parent = parent.parentElement) {
    if (parent instanceof HTMLDetailsElement) {
      parent.open = true;
    }
  }
  if (input?.getClientRects().length) {
    input.focus();
  } else {
    document.querySelector<HTMLElement>(".area-error")?.focus();
  }
}
