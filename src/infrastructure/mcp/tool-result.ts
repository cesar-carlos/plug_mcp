import { DomainError, isDomainError } from "../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../domain/errors/error-codes.js";
import type { LoggerPort } from "../../domain/ports/logger.port.js";
import type { AppConfig } from "../../config/env.js";
import { wwwAuthenticate } from "../oauth/bearer-auth.js";

export interface ToolResult {
  [key: string]: unknown;
  content: { type: "text"; text: string }[];
  isError?: boolean;
  _meta?: Record<string, unknown>;
}

export const jsonResult = (payload: unknown): ToolResult => ({
  content: [{ type: "text", text: JSON.stringify(payload) }],
});

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

export const createToolRunner = (config: AppConfig, logger: LoggerPort): ToolRunner => {
  return async (tool: string, fn: () => Promise<unknown>): Promise<ToolResult> => {
    try {
      const value = await fn();
      return jsonResult(value);
    } catch (error) {
      return errorResult(error, config, logger, tool);
    }
  };
};
