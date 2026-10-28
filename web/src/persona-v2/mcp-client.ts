export interface McpToolResponse {
  result?: { isError?: boolean; content: { text?: string }[] };
  error?: unknown;
}

export function mcpAuthorizationHeader(token: string): string {
  const value = token
    .trim()
    .replace(/^Bearer\s+/i, "")
    .trim();
  return `Bearer ${value}`;
}

export function assertTokenPersona(context: { id: string }, personaId: string): void {
  if (context.id !== personaId) {
    throw new Error("Este token pertence a outra persona.");
  }
}

export function assertGrantedPublication(
  permitted: readonly { id: string; publicationId: string; hash: string }[],
  skillId: string,
  publication: { id: string; hash: string },
): void {
  if (
    !permitted.some(
      (item) =>
        item.id === skillId &&
        item.publicationId === publication.id &&
        item.hash === publication.hash,
    )
  ) {
    throw new Error(
      "Esta publicação não está concedida ao token atual. Confira as consultas permitidas.",
    );
  }
}

export function mcpToolErrorMessage(
  value: { error?: { message?: string; hint?: string } } | null,
): string {
  const message = value?.error?.message?.trim();
  const hint = value?.error?.hint?.trim();
  if (!message) {
    return "Solicitação recusada. Confira treinamento, fonte e permissões.";
  }
  if (!hint || message.includes(hint)) {
    return message;
  }
  return `${message} ${hint}`;
}

export function parseMcpToolResult<T>(response: McpToolResponse): T {
  let value: { error?: { message?: string; hint?: string } } | null;
  try {
    value = JSON.parse(response.result?.content[0]?.text ?? "null") as typeof value;
  } catch {
    throw new Error(
      "Resposta inválida do MCP. Verifique o estado; não repita ações com possível efeito.",
    );
  }
  if (!response.result || response.result.isError) {
    throw new Error(mcpToolErrorMessage(value));
  }
  return value as T;
}
