import { randomUUID } from "node:crypto";
import { DomainError } from "../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../domain/errors/error-codes.js";
import type { LoggerPort } from "../../domain/ports/logger.port.js";
import type {
  AgentAccessStatus,
  ClientTokenPolicy,
  PlugHubTokens,
  PlugServerGatewayPort,
  RequestAgentAccessResult,
  SqlExecuteResult,
} from "../../domain/ports/plug-server-gateway.port.js";
import {
  mapPlugServerFailure,
  mapPlugServerAbort,
  isAbortError,
  parseRetryAfterMs,
} from "./map-plug-error.js";

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;

const asUnknownArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

export class PlugServerRestAdapter implements PlugServerGatewayPort {
  constructor(
    private readonly baseUrl: string,
    private readonly logger: LoggerPort,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly httpTimeoutMs = 35_000,
  ) {}

  async login(email: string, password: string): Promise<PlugHubTokens> {
    return this.postTokens("/api/v1/client-auth/login", { email, password });
  }

  async refresh(refreshToken: string): Promise<PlugHubTokens> {
    return this.postTokens("/api/v1/client-auth/refresh", { refreshToken });
  }

  async requestAgentAccess(
    accessToken: string,
    agentId: string,
  ): Promise<RequestAgentAccessResult> {
    const json = await this.request(accessToken, "POST", "/api/v1/client/me/agents", {
      agentIds: [agentId],
    });
    const data = asRecord(json)?.data ?? json;
    const rec = asRecord(data) ?? {};
    return {
      requested: asStringArray(rec.requested),
      alreadyApproved: asStringArray(rec.alreadyApproved),
      newRequests: asStringArray(rec.newRequests),
    };
  }

  async getAgentAccessStatus(accessToken: string, agentId: string): Promise<AgentAccessStatus> {
    try {
      const json = await this.request(accessToken, "GET", `/api/v1/client/me/agents/${agentId}`);
      const rec = asRecord(asRecord(json)?.data) ?? asRecord(json) ?? {};
      return {
        agentId,
        state: "approved",
        hasClientToken: rec.hasClientToken === true,
        isHubConnected: typeof rec.isHubConnected === "boolean" ? rec.isHubConnected : null,
      };
    } catch (error) {
      if (!(error instanceof DomainError && error.code === ERROR_CODES.AGENT_ACCESS_DENIED)) {
        throw error;
      }
      return {
        agentId,
        state: await this.resolveDeniedAccessState(accessToken, agentId),
        hasClientToken: false,
        isHubConnected: null,
      };
    }
  }

  async putClientToken(
    accessToken: string,
    agentId: string,
    clientToken: string | null,
  ): Promise<void> {
    await this.request(accessToken, "PUT", `/api/v1/client/me/agents/${agentId}/client-token`, {
      clientToken,
    });
  }

  async getClientTokenPolicy(input: {
    accessToken: string;
    agentId: string;
    clientToken: string;
  }): Promise<ClientTokenPolicy> {
    const json = await this.request(input.accessToken, "POST", "/api/v1/agents/commands", {
      agentId: input.agentId,
      timeoutMs: 15_000,
      command: {
        jsonrpc: "2.0",
        method: "client_token.getPolicy",
        id: randomUUID(),
        params: { client_token: input.clientToken },
      },
    });
    const result = unwrapRpcResult(json);
    return {
      allTables: result.allTables === true || result.all_tables === true,
      tables: asStringArray(result.tables ?? result.allowedTables ?? result.allowed_tables),
    };
  }

  async executeSql(input: {
    accessToken: string;
    agentId: string;
    clientToken: string;
    sql: string;
    params?: Record<string, unknown>;
    options?: { maxRows?: number; timeoutMs?: number; page?: number; pageSize?: number };
  }): Promise<SqlExecuteResult> {
    const options: Record<string, unknown> = {
      max_rows: input.options?.maxRows,
      execution_mode: "preserve",
    };
    if (input.options?.timeoutMs) {
      options.timeout_ms = input.options.timeoutMs;
    }
    if (input.options?.page && input.options.pageSize) {
      options.page = input.options.page;
      options.page_size = input.options.pageSize;
    }
    const json = await this.request(input.accessToken, "POST", "/api/v1/agents/commands", {
      agentId: input.agentId,
      timeoutMs: input.options?.timeoutMs ?? 30_000,
      command: {
        jsonrpc: "2.0",
        method: "sql.execute",
        id: randomUUID(),
        params: {
          sql: input.sql,
          params: input.params,
          client_token: input.clientToken,
          options,
        },
      },
    });
    return normalizeSqlResult(json);
  }

  private async resolveDeniedAccessState(
    accessToken: string,
    agentId: string,
  ): Promise<AgentAccessStatus["state"]> {
    try {
      const json = await this.request(
        accessToken,
        "GET",
        `/api/v1/client/me/agent-access-requests?search=${encodeURIComponent(agentId)}&pageSize=20`,
      );
      const rec = asRecord(json) ?? {};
      const nested = asRecord(rec.data);
      const raw = Array.isArray(rec.requests)
        ? rec.requests
        : Array.isArray(nested?.requests)
          ? nested.requests
          : [];
      const match = raw.map((item) => asRecord(item)).find((item) => item?.agentId === agentId);
      const status = typeof match?.status === "string" ? match.status : undefined;
      if (
        status === "pending" ||
        status === "approved" ||
        status === "rejected" ||
        status === "revoked" ||
        status === "expired"
      ) {
        return status;
      }
      return "unknown";
    } catch {
      return "unknown";
    }
  }

  private async postTokens(path: string, body: Record<string, string>): Promise<PlugHubTokens> {
    const json = await this.request(null, "POST", path, body);
    const rec = asRecord(json) ?? {};
    const data = asRecord(rec.data) ?? rec;
    const accessToken =
      (typeof data.accessToken === "string" && data.accessToken) ||
      (typeof data.token === "string" && data.token) ||
      "";
    const refreshToken = typeof data.refreshToken === "string" ? data.refreshToken : "";
    if (!accessToken) {
      throw new DomainError({
        code: ERROR_CODES.USER_AUTH_EXPIRED,
        message: "Login no plug-server não devolveu accessToken.",
        hint: "Confira e-mail e senha do Client. Se o Client estiver pendente/bloqueado, peça ativação ao dono do ERP.",
      });
    }
    return { accessToken, refreshToken };
  }

  private async request(
    accessToken: string | null,
    method: string,
    path: string,
    body?: unknown,
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: {
          accept: "application/json",
          ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
          ...(body !== undefined ? { "content-type": "application/json" } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(this.httpTimeoutMs),
      });
    } catch (error) {
      if (isAbortError(error)) {
        throw mapPlugServerAbort();
      }
      throw error;
    }

    const json: unknown = await response.json().catch(() => ({}));
    const retryAfterMs = parseRetryAfterMs(
      response.headers.get("retry-after"),
      response.headers.get("ratelimit-reset"),
    );
    if (!response.ok) {
      this.logger.warn("plug-server http error", { method, path, status: response.status });
      throw mapPlugServerFailure(
        { status: response.status, body: json, retryAfterMs },
        this.logger,
      );
    }
    const rpc = asRecord(asRecord(asRecord(json)?.response)?.item)?.error;
    if (rpc) {
      throw mapPlugServerFailure({ status: 200, body: json, retryAfterMs }, this.logger);
    }
    return json;
  }
}

const unwrapRpcResult = (body: unknown): Record<string, unknown> => {
  const root = asRecord(body);
  const response = asRecord(root?.response) ?? asRecord(root?.data) ?? root;
  const item = asRecord(response?.item) ?? response;
  return asRecord(item?.result) ?? asRecord(item?.data) ?? item ?? {};
};

export const normalizeSqlResult = (body: unknown): SqlExecuteResult => {
  const result = unwrapRpcResult(body);
  let columns = Array.isArray(result.columns)
    ? result.columns.map((col) => (typeof col === "string" ? col : String(col)))
    : [];
  const rawRows =
    asUnknownArray(result.rows).length > 0
      ? asUnknownArray(result.rows)
      : asUnknownArray(result.data);
  const firstRaw = rawRows[0];
  if (columns.length === 0 && Array.isArray(firstRaw)) {
    columns = firstRaw.map((_cell, index) => `col_${index}`);
  }
  const rows = rawRows.map((row) => {
    if (Array.isArray(row)) {
      const obj: Record<string, unknown> = {};
      columns.forEach((col, index) => {
        obj[col] = row[index];
      });
      return obj;
    }
    return asRecord(row) ?? {};
  });
  const inferred = columns.length > 0 ? columns : rows[0] ? Object.keys(rows[0]) : [];
  return { columns: inferred, rows };
};
