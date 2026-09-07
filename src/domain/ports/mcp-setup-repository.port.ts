/** TTL do código one-shot `GET /setup/{code}` (memória e `mcp_setup`). 7 dias. */
export const MCP_SETUP_TTL_DAYS = 7;
export const MCP_SETUP_TTL_MS = MCP_SETUP_TTL_DAYS * 86_400_000;

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
