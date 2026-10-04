/** Entrega interna legada ao formulário. Operações públicas usam SetupOperationRepositoryPort. */
export const MCP_SETUP_TTL_DAYS = 15 / (24 * 60);
export const MCP_SETUP_TTL_MS = 15 * 60_000;

export interface McpSetupIssue {
  readonly code: string;
  readonly token: string;
  readonly expiresAt: Date;
  readonly acessoId: string | null;
}

export interface McpSetupRepositoryPort {
  issue(input: McpSetupIssue): Promise<void>;
  consume(code: string): Promise<string | null>;
  purgeExpired(now?: Date): Promise<number>;
}
