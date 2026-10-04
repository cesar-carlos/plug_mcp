import type {
  AgentAccessStatus,
  ClientTokenPolicy,
  PlugHubTokens,
  PlugServerGatewayPort,
  RequestAgentAccessResult,
  SqlExecuteOptions,
  SqlExecuteResult,
} from "../../domain/ports/plug-server-gateway.port.js";

const DEFAULT_TTL_MS = 5 * 60_000;

export interface PolicyCacheKv {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options: { PX: number }): Promise<unknown>;
}

export class CachedPlugGateway implements PlugServerGatewayPort {
  private readonly memory = new Map<string, { value: ClientTokenPolicy; expiresAt: number }>();

  constructor(
    private readonly inner: PlugServerGatewayPort,
    private readonly options: { ttlMs?: number; kv?: PolicyCacheKv } = {},
  ) {}

  private ttl(): number {
    return this.options.ttlMs ?? DEFAULT_TTL_MS;
  }

  login(email: string, password: string): Promise<PlugHubTokens> {
    return this.inner.login(email, password);
  }

  refresh(refreshToken: string): Promise<PlugHubTokens> {
    return this.inner.refresh(refreshToken);
  }

  requestAgentAccess(accessToken: string, agentId: string): Promise<RequestAgentAccessResult> {
    return this.inner.requestAgentAccess(accessToken, agentId);
  }

  getAgentAccessStatus(accessToken: string, agentId: string): Promise<AgentAccessStatus> {
    return this.inner.getAgentAccessStatus(accessToken, agentId);
  }

  putClientToken(accessToken: string, agentId: string, clientToken: string | null): Promise<void> {
    this.memory.clear();
    return this.inner.putClientToken(accessToken, agentId, clientToken);
  }

  async getClientTokenPolicy(input: {
    accessToken: string;
    agentId: string;
    clientToken: string;
  }): Promise<ClientTokenPolicy> {
    // Result caches must never bypass a policy revocation. Do not reuse a
    // policy keyed only by agent/token across authenticated users.
    return this.inner.getClientTokenPolicy(input);
  }

  executeSql(input: {
    accessToken: string;
    agentId: string;
    clientToken: string;
    sql: string;
    params?: Record<string, unknown>;
    options?: SqlExecuteOptions;
  }): Promise<SqlExecuteResult> {
    return this.inner.executeSql(input);
  }
}
