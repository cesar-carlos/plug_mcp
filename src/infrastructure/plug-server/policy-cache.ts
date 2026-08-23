import { createHash } from "node:crypto";
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
const KEY_PREFIX = "mcp:policy:";

export interface PolicyCacheKv {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options: { PX: number }): Promise<unknown>;
}

const policyKey = (agentId: string, clientToken: string): string =>
  `${KEY_PREFIX}${agentId}:${createHash("sha256").update(clientToken).digest("hex")}`;

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
    const key = policyKey(input.agentId, input.clientToken);
    const local = this.memory.get(key);
    if (local && local.expiresAt > Date.now()) {
      return local.value;
    }
    const kv = this.options.kv;
    if (kv) {
      const raw = await kv.get(key);
      if (raw) {
        const value = JSON.parse(raw) as ClientTokenPolicy;
        this.memory.set(key, { value, expiresAt: Date.now() + this.ttl() });
        return value;
      }
    }
    const value = await this.inner.getClientTokenPolicy(input);
    this.memory.set(key, { value, expiresAt: Date.now() + this.ttl() });
    if (kv) {
      await kv.set(key, JSON.stringify(value), { PX: this.ttl() });
    }
    return value;
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
