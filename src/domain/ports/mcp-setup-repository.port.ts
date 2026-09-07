export interface McpSetupIssue {
  readonly code: string;
  readonly token: string;
  readonly expiresAt: Date;
  readonly acessoId: string | null;
}

export interface McpSetupRepositoryPort {
  issue(input: McpSetupIssue): Promise<void>;
  consume(code: string): Promise<string | null>;
}
