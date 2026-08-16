import type {
  AgentAccessStatus,
  PlugServerGatewayPort,
  RequestAgentAccessResult,
  SqlExecuteResult,
} from "../../src/domain/ports/plug-server-gateway.port.js";
import { DomainError } from "../../src/domain/errors/domain-error.js";
import { ERROR_CODES } from "../../src/domain/errors/error-codes.js";

export class FakePlugServer implements PlugServerGatewayPort {
  approved = new Set<string>();
  pending = new Set<string>();
  rejected = new Set<string>();
  revoked = new Set<string>();
  tokens = new Map<string, string>();
  lastSql: string | null = null;
  lastParams: Record<string, unknown> | undefined;
  lastOptions: unknown = null;
  sqlImpl: () => Promise<SqlExecuteResult> = async () => ({
    columns: ["TotalVendas"],
    rows: [{ TotalVendas: 1854321.87 }],
  });

  async requestAgentAccess(agentId: string): Promise<RequestAgentAccessResult> {
    if (this.approved.has(agentId)) {
      return { requested: [agentId], alreadyApproved: [agentId], newRequests: [] };
    }
    this.pending.add(agentId);
    this.rejected.delete(agentId);
    this.revoked.delete(agentId);
    return { requested: [agentId], alreadyApproved: [], newRequests: [agentId] };
  }

  async getAgentAccessStatus(agentId: string): Promise<AgentAccessStatus> {
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

  async putClientToken(agentId: string, clientToken: string | null): Promise<void> {
    if (clientToken) this.tokens.set(agentId, clientToken);
    else this.tokens.delete(agentId);
  }

  async executeSql(input: {
    agentId: string;
    clientToken: string;
    sql: string;
    params?: Record<string, unknown>;
    options?: { maxRows?: number };
  }): Promise<SqlExecuteResult> {
    this.lastSql = input.sql;
    this.lastParams = input.params;
    this.lastOptions = input.options;
    if (!this.approved.has(input.agentId)) {
      throw new DomainError({
        code: ERROR_CODES.AGENT_ACCESS_DENIED,
        message: "sem acesso",
        hint: "verificar_status_ambiente",
      });
    }
    return this.sqlImpl();
  }

  approve(agentId: string): void {
    this.pending.delete(agentId);
    this.rejected.delete(agentId);
    this.revoked.delete(agentId);
    this.approved.add(agentId);
  }

  reject(agentId: string): void {
    this.pending.delete(agentId);
    this.approved.delete(agentId);
    this.revoked.delete(agentId);
    this.rejected.add(agentId);
  }
}
