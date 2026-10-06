import { DomainError, ERROR_SOURCE, isDomainError } from "../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../domain/errors/error-codes.js";
import { isAnexoExportPayload } from "../../domain/entities/anexo.js";
import { absoluteErrorMappingUrl } from "../../domain/errors/error-next-action.js";
import type { LoggerPort } from "../../domain/ports/logger.port.js";
import type { AppConfig } from "../../config/env.js";
import type { RateLimitStore } from "../http/rate-limit.js";
import { currentAccountId, currentClientIp } from "./account-context.js";
import { chatGptOAuthChallenge } from "../oauth/challenge.js";
import {
  assertConsumerAuthorized,
  currentConsumerAuth,
  sessionContext,
} from "../../application/session-context.js";

export type ToolContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string }
  | {
      type: "resource";
      resource:
        | { uri: string; mimeType: string; blob: string }
        | { uri: string; mimeType: string; text: string };
    };

export interface ToolResult {
  [key: string]: unknown;
  content: ToolContent[];
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
  if (isAnexoExportPayload(payload)) {
    const meta = {
      success: true as const,
      mime: payload.mime,
      bytes: payload.bytes,
      resized: payload.resized,
      ...(payload.aviso ? { aviso: payload.aviso } : {}),
    };
    const summary = payload.aviso
      ? `Anexo ${payload.mime}, ${String(payload.bytes)} bytes. ${payload.aviso}`
      : `Anexo ${payload.mime}, ${String(payload.bytes)} bytes.`;
    const dataB64 = Buffer.from(payload.data).toString("base64");
    if (payload.mime === "application/pdf") {
      return {
        content: [
          { type: "text", text: summary },
          {
            type: "resource",
            resource: {
              uri: "anexo://export/pdf",
              mimeType: payload.mime,
              blob: dataB64,
            },
          },
        ],
        structuredContent: meta,
      };
    }
    return {
      content: [
        { type: "text", text: summary },
        { type: "image", data: dataB64, mimeType: payload.mime },
      ],
      structuredContent: meta,
    };
  }
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
  let authCause: DomainError | undefined;
  let cause: unknown = error;
  for (let depth = 0; depth < 5; depth++) {
    if (isDomainError(cause) && cause.stage === "oauth") {
      authCause = cause;
      break;
    }
    cause = cause instanceof Error ? cause.cause : undefined;
  }
  const domain = isDomainError(error)
    ? error
    : (authCause ??
      (() => {
        logger?.error("tool failed with unexpected error", {
          tool,
          ...(currentConsumerAuth()?.kind === "oauth"
            ? { stage: "oauth_operation" }
            : {
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
              }),
        });
        return new DomainError({
          code: ERROR_CODES.INTERNAL_ERROR,
          message: "Erro interno.",
          hint: "Tente de novo. Se persistir, reporte o code INTERNAL_ERROR ao suporte Se7e. Não reescreva o SQL por causa deste code.",
          retryable: true,
          source: ERROR_SOURCE.mcp,
        });
      })());
  const json = domain.toJson();
  const documentationUrl = json.error.documentationUrl
    ? absoluteErrorMappingUrl(config.PUBLIC_BASE_URL, json.error.documentationUrl)
    : undefined;
  const payload = documentationUrl
    ? { success: false as const, error: { ...json.error, documentationUrl } }
    : json;
  const meta: Record<string, unknown> = {};
  if (
    domain.code === ERROR_CODES.UNAUTHENTICATED &&
    currentConsumerAuth()?.kind === "oauth" &&
    domain.stage === "oauth"
  ) {
    meta["mcp/www_authenticate"] = [chatGptOAuthChallenge(config.PUBLIC_BASE_URL, true)];
  }
  return {
    content: [{ type: "text", text: JSON.stringify(payload) }],
    isError: true,
    structuredContent: payload as unknown as Record<string, unknown>,
    _meta: Object.keys(meta).length ? meta : undefined,
  };
};

export type ToolRunner = (tool: string, fn: () => Promise<unknown>) => Promise<ToolResult>;

export interface ToolRunnerExtra {
  readonly rateLimit?: RateLimitStore;
  readonly clientIp?: () => string | undefined;
}

const maxForTool = (config: AppConfig, tool: string): number => {
  if (
    tool === "consultar_dados" ||
    tool === "exportar_anexo" ||
    tool.startsWith("skill_") ||
    tool === "treinar_com_sql"
  ) {
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
      const auth = currentConsumerAuth();
      const principal =
        auth?.acessoId ?? currentAccountId() ?? currentClientIp() ?? extra.clientIp?.() ?? "anon";
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
            source: "mcp",
            stage: "rate_limit",
          }),
          config,
          logger,
          tool,
        );
      }
    }
    try {
      await assertConsumerAuthorized();
      const auth = currentConsumerAuth();
      if (extra?.rateLimit && auth?.kind === "oauth") {
        const hit = await extra.rateLimit.hit(
          `tool:grant:${auth.grantId}:${tool}`,
          config.MCP_RATE_LIMIT_WINDOW_MS,
          maxForTool(config, tool),
        );
        if (!hit.allowed)
          throw new DomainError({
            code: ERROR_CODES.RATE_LIMITED,
            message: "Limite da conexão.",
            hint: "Aguarde antes de repetir.",
            source: "mcp",
            stage: "rate_limit",
          });
      }
      const value = await fn();
      if (!sessionContext.getStore()?.terminal) await assertConsumerAuthorized();
      return jsonResult(value);
    } catch (error) {
      return errorResult(error, config, logger, tool);
    }
  };
};
