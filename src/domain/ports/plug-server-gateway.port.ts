export interface SqlExecuteOptions {
  readonly maxRows?: number;
  readonly page?: number;
  readonly pageSize?: number;
  readonly timeoutMs?: number;
}

export interface SqlExecuteResult {
  readonly columns: readonly string[];
  readonly rows: readonly Record<string, unknown>[];
}

export type AgentAccessState =
  "approved" | "pending" | "rejected" | "revoked" | "expired" | "unknown";

export interface AgentAccessStatus {
  readonly agentId: string;
  readonly state: AgentAccessState;
  readonly hasClientToken: boolean;
  readonly isHubConnected: boolean | null;
}

export interface RequestAgentAccessResult {
  readonly requested: readonly string[];
  readonly alreadyApproved: readonly string[];
  readonly newRequests: readonly string[];
}

export interface PlugServerGatewayPort {
  requestAgentAccess(agentId: string): Promise<RequestAgentAccessResult>;
  getAgentAccessStatus(agentId: string): Promise<AgentAccessStatus>;
  putClientToken(agentId: string, clientToken: string | null): Promise<void>;
  executeSql(input: {
    agentId: string;
    clientToken: string;
    sql: string;
    params?: Record<string, unknown>;
    options?: SqlExecuteOptions;
  }): Promise<SqlExecuteResult>;
}
