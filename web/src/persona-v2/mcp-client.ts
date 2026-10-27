export interface McpToolResponse {
  result?: { isError?: boolean; content: { text?: string }[] };
  error?: unknown;
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

export function parseMcpToolResult<T>(response: McpToolResponse): T {
  let value: { error?: { message?: string } } | null;
  try {
    value = JSON.parse(response.result?.content[0]?.text ?? "null") as typeof value;
  } catch {
    throw new Error(
      "Resposta inválida do MCP. Verifique o estado; não repita ações com possível efeito.",
    );
  }
  if (!response.result || response.result.isError) {
    throw new Error(
      value?.error?.message ?? "Solicitação recusada. Confira treinamento, fonte e permissões.",
    );
  }
  return value as T;
}
