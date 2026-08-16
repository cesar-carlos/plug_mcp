import { randomUUID } from "node:crypto";
import { DomainError } from "../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../domain/errors/error-codes.js";
import type { LoggerPort } from "../../domain/ports/logger.port.js";
import type {
  AgentAccessStatus,
  PlugServerGatewayPort,
  RequestAgentAccessResult,
  SqlExecuteOptions,
  SqlExecuteResult,
} from "../../domain/ports/plug-server-gateway.port.js";
import {
  mapPlugServerFailure,
  mapPlugServerAbort,
  isAbortError,
  parseRetryAfterMs,
} from "./map-plug-error.js";
import type { ServiceTokenManager } from "./token-manager.js";

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;

const asUnknownArray = (value: unknown): unknown[] =>
  Array.isArray(value) ? (value as unknown[]) : [];

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

export class PlugServerRestAdapter implements PlugServerGatewayPort {
  constructor(
    private readonly baseUrl: string,
    private readonly tokens: ServiceTokenManager,
    private readonly logger: LoggerPort,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly httpTimeoutMs = 35_000,
  ) {}

  async requestAgentAccess(agentId: string): Promise<RequestAgentAccessResult> {
    const json = await this.request("POST", "/api/v1/client/me/agents", { agentIds: [agentId] });
    const data = asRecord(json)?.data ?? json;
    const rec = asRecord(data) ?? {};
    return {
      requested: asStringArray(rec.requested),
      alreadyApproved: asStringArray(rec.alreadyApproved),
      newRequests: asStringArray(rec.newRequests),
    };
  }

  async getAgentAccessStatus(agentId: string): Promise<AgentAccessStatus> {
    try {
      const json = await this.request("GET", `/api/v1/client/me/agents/${agentId}`);
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
        state: await this.resolveDeniedAccessState(agentId),
        hasClientToken: false,
        isHubConnected: null,
      };
    }
  }

  private async resolveDeniedAccessState(agentId: string): Promise<AgentAccessStatus["state"]> {
    try {
      const json = await this.request(
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

  async putClientToken(agentId: string, clientToken: string | null): Promise<void> {
    await this.request("PUT", `/api/v1/client/me/agents/${agentId}/client-token`, { clientToken });
  }

  async executeSql(input: {
    agentId: string;
    clientToken: string;
    sql: string;
    params?: Record<string, unknown>;
    options?: SqlExecuteOptions;
  }): Promise<SqlExecuteResult> {
    const options: Record<string, unknown> = {
      max_rows: input.options?.maxRows,
      // MCP já aplica max_rows; `managed` pode reescrever agregações (SUM/COUNT) e devolver row vazia.
      execution_mode: "preserve",
    };
    if (input.options?.timeoutMs) options.timeout_ms = input.options.timeoutMs;
    if (input.options?.page && input.options.pageSize) {
      options.page = input.options.page;
      options.page_size = input.options.pageSize;
    }
    const json = await this.request("POST", "/api/v1/agents/commands", {
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

  private async request(method: string, path: string, body?: unknown): Promise<unknown> {
    const exec = async (token: string): Promise<Response> =>
      this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          accept: "application/json",
          ...(body !== undefined ? { "content-type": "application/json" } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(this.httpTimeoutMs),
      });

    let token = await this.tokens.getAccessToken();
    let response: Response;
    try {
      response = await exec(token);
      if (response.status === 401) {
        this.tokens.invalidate();
        token = await this.tokens.getAccessToken();
        response = await exec(token);
      }
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
      this.logger.warn("plug-server http error", {
        method,
        path,
        status: response.status,
      });
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

export const normalizeSqlResult = (body: unknown): SqlExecuteResult => {
  const root = asRecord(body);
  const response = asRecord(root?.response) ?? asRecord(root?.data) ?? root;
  const item = asRecord(response?.item) ?? response;
  const result = asRecord(item?.result) ?? asRecord(item?.data) ?? item;
  if (!result) {
    return { columns: [], rows: [] };
  }
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
  const inferredColumns = columns.length > 0 ? columns : rows[0] ? Object.keys(rows[0]) : [];
  return { columns: inferredColumns, rows };
};
