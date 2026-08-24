import { DomainError } from "../../src/domain/errors/domain-error.js";
import { ERROR_CODES } from "../../src/domain/errors/error-codes.js";
import type {
  AgentAccessStatus,
  ClientTokenPolicy,
  PlugHubTokens,
  PlugServerGatewayPort,
  RequestAgentAccessResult,
  SqlExecuteResult,
} from "../../src/domain/ports/plug-server-gateway.port.js";

export class FakePlugServer implements PlugServerGatewayPort {
  approved = new Set<string>();
  pending = new Set<string>();
  rejected = new Set<string>();
  revoked = new Set<string>();
  tokens = new Map<string, string>();
  lastSql: string | null = null;
  lastParams: Record<string, unknown> | undefined;
  policy: ClientTokenPolicy = { allTables: true, tables: [] };
  sqlImpl: () => Promise<SqlExecuteResult> = async () => ({
    columns: ["ok"],
    rows: [{ ok: 1 }],
  });
  loginImpl: () => Promise<PlugHubTokens> = async () => ({
    accessToken: "access-test",
    refreshToken: "refresh-test",
  });

  async login(_email: string, _password: string): Promise<PlugHubTokens> {
    return this.loginImpl();
  }

  async refresh(_refreshToken: string): Promise<PlugHubTokens> {
    return this.loginImpl();
  }

  async requestAgentAccess(
    _accessToken: string,
    agentId: string,
  ): Promise<RequestAgentAccessResult> {
    if (this.approved.has(agentId)) {
      return { requested: [agentId], alreadyApproved: [agentId], newRequests: [] };
    }
    this.pending.add(agentId);
    return { requested: [agentId], alreadyApproved: [], newRequests: [agentId] };
  }

  async getAgentAccessStatus(_accessToken: string, agentId: string): Promise<AgentAccessStatus> {
    let state: AgentAccessStatus["state"] = "unknown";
    if (this.approved.has(agentId)) {
      state = "approved";
    } else if (this.pending.has(agentId)) {
      state = "pending";
    } else if (this.rejected.has(agentId)) {
      state = "rejected";
    } else if (this.revoked.has(agentId)) {
      state = "revoked";
    }
    return {
      agentId,
      state,
      hasClientToken: this.tokens.has(agentId),
      isHubConnected: true,
    };
  }

  async putClientToken(
    _accessToken: string,
    agentId: string,
    clientToken: string | null,
  ): Promise<void> {
    if (clientToken) {
      this.tokens.set(agentId, clientToken);
    } else {
      this.tokens.delete(agentId);
    }
  }

  async getClientTokenPolicy(_input: {
    accessToken: string;
    agentId: string;
    clientToken: string;
  }): Promise<ClientTokenPolicy> {
    return this.policy;
  }

  async executeSql(input: {
    accessToken: string;
    agentId: string;
    clientToken: string;
    sql: string;
    params?: Record<string, unknown>;
    options?: { maxRows?: number; page?: number; pageSize?: number; timeoutMs?: number };
  }): Promise<SqlExecuteResult> {
    this.lastSql = input.sql;
    this.lastParams = input.params;
    if (!this.approved.has(input.agentId)) {
      throw new DomainError({
        code: ERROR_CODES.AGENT_ACCESS_DENIED,
        message: "sem acesso",
        hint: "verificar_acesso",
      });
    }
    return this.sqlImpl();
  }

  approve(agentId: string): void {
    this.pending.delete(agentId);
    this.approved.add(agentId);
  }
}
