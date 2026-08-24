import { DomainError, isDomainError } from "../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../domain/errors/error-codes.js";
import type { LoggerPort } from "../../domain/ports/logger.port.js";
import type { AppConfig } from "../../config/env.js";
import type { RateLimitStore } from "../http/rate-limit.js";
import { wwwAuthenticate } from "./mcp-auth.js";
import { currentAccountId, currentClientIp } from "./account-context.js";

export interface ToolResult {
  [key: string]: unknown;
  content: { type: "text"; text: string }[];
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
  _meta?: Record<string, unknown>;
}

const isTabularPayload = (
  payload: unknown,
): payload is {
  columns: unknown;
  rows: unknown;
  truncated?: unknown;
  maxRowsApplied?: unknown;
} =>
  typeof payload === "object" &&
  payload !== null &&
  Array.isArray((payload as { columns?: unknown }).columns) &&
  Array.isArray((payload as { rows?: unknown }).rows);

export const jsonResult = (payload: unknown): ToolResult => {
  const result: ToolResult = {
    content: [{ type: "text", text: JSON.stringify(payload) }],
  };
  if (isTabularPayload(payload)) {
    result.structuredContent = { ...payload };
  }
  return result;
};

export const errorResult = (
  error: unknown,
  config: AppConfig,
  logger?: LoggerPort,
  tool?: string,
): ToolResult => {
  const domain = isDomainError(error)
    ? error
    : (() => {
        logger?.error("tool failed with unexpected error", {
          tool,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
        return new DomainError({
          code: ERROR_CODES.INTERNAL_ERROR,
          message: "Erro interno.",
          hint: "Tente de novo. Se persistir, reporte o code INTERNAL_ERROR ao suporte Se7e.",
          retryable: true,
        });
      })();
  const payload = domain.toJson();
  const meta: Record<string, unknown> = {};
  if (domain.code === ERROR_CODES.UNAUTHENTICATED) {
    meta["mcp/www_authenticate"] = [
      `${wwwAuthenticate(config)}, error="invalid_token", error_description="Login required"`,
    ];
  }
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
    isError: true,
    _meta: Object.keys(meta).length ? meta : undefined,
  };
};

export type ToolRunner = (tool: string, fn: () => Promise<unknown>) => Promise<ToolResult>;

export interface ToolRunnerExtra {
  readonly rateLimit?: RateLimitStore;
  readonly clientIp?: () => string | undefined;
}

const maxForTool = (config: AppConfig, tool: string): number => {
  if (tool === "consultar_dados" || tool.startsWith("skill_") || tool === "treinar_com_sql") {
    return config.MCP_QUERY_TOOL_RATE_LIMIT_MAX;
  }
  if (tool === "registrar_acesso") {
    return config.MCP_BOOTSTRAP_RATE_LIMIT_MAX;
  }
  return config.MCP_TOOL_RATE_LIMIT_MAX;
};

export const createToolRunner = (
  config: AppConfig,
  logger: LoggerPort,
  extra?: ToolRunnerExtra,
): ToolRunner => {
  return async (tool: string, fn: () => Promise<unknown>): Promise<ToolResult> => {
    if (extra?.rateLimit) {
      const principal = currentAccountId() ?? currentClientIp() ?? extra.clientIp?.() ?? "anon";
      const hit = await extra.rateLimit.hit(
        `tool:${principal}:${tool}`,
        config.MCP_RATE_LIMIT_WINDOW_MS,
        maxForTool(config, tool),
      );
      if (!hit.allowed) {
        return errorResult(
          new DomainError({
            code: ERROR_CODES.RATE_LIMITED,
            message: "Rate limit da tool.",
            hint: `Aguarde ${Math.ceil(hit.retryAfterMs / 1000)}s e tente de novo.`,
            retryable: true,
            retryAfterMs: hit.retryAfterMs,
          }),
          config,
          logger,
          tool,
        );
      }
    }
    try {
      const value = await fn();
      return jsonResult(value);
    } catch (error) {
      return errorResult(error, config, logger, tool);
    }
  };
};
