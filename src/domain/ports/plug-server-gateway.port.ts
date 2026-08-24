export interface PlugHubTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
}

export interface RequestAgentAccessResult {
  readonly requested: readonly string[];
  readonly alreadyApproved: readonly string[];
  readonly newRequests: readonly string[];
}

export interface AgentAccessStatus {
  readonly agentId: string;
  readonly state: "pending" | "approved" | "rejected" | "revoked" | "expired" | "unknown";
  readonly hasClientToken: boolean;
  readonly isHubConnected: boolean | null;
}

export interface SqlExecuteOptions {
  readonly maxRows?: number;
  readonly timeoutMs?: number;
  readonly page?: number;
  readonly pageSize?: number;
}

export interface SqlExecuteResult {
  readonly columns: readonly string[];
  readonly rows: readonly Record<string, unknown>[];
}

export interface ClientTokenPolicy {
  readonly allTables: boolean;
  readonly tables: readonly string[];
}

export interface PlugServerGatewayPort {
  login(email: string, password: string): Promise<PlugHubTokens>;
  refresh(refreshToken: string): Promise<PlugHubTokens>;
  requestAgentAccess(accessToken: string, agentId: string): Promise<RequestAgentAccessResult>;
  getAgentAccessStatus(accessToken: string, agentId: string): Promise<AgentAccessStatus>;
  putClientToken(accessToken: string, agentId: string, clientToken: string | null): Promise<void>;
  getClientTokenPolicy(input: {
    accessToken: string;
    agentId: string;
    clientToken: string;
  }): Promise<ClientTokenPolicy>;
  executeSql(input: {
    accessToken: string;
    agentId: string;
    clientToken: string;
    sql: string;
    params?: Record<string, unknown>;
    options?: SqlExecuteOptions;
  }): Promise<SqlExecuteResult>;
}

export interface UsuarioPlugSessionPort {
  getAccessToken(usuarioId: string): Promise<string>;
  invalidate(usuarioId: string): void;
  remember(usuarioId: string, tokens: PlugHubTokens): void;
}
