import { randomUUID } from "node:crypto";
import type { LoggerPort } from "../../domain/ports/logger.port.js";
import type { ErrorRequestHandler } from "express";

export const personaMcpParserError =
  (logger?: LoggerPort): ErrorRequestHandler =>
  (error, req, res, next) => {
    if (!["/mcp", "/mcp/chatgpt"].includes(req.path)) {
      next(error);
      return;
    }
    const status =
      (error as { type?: unknown } | undefined)?.type === "entity.too.large" ? 413 : 400;
    res.status(status).json({
      error: reportPersonaProtocolError(
        logger,
        status === 413 ? "REQUEST_TOO_LARGE" : "MCP_PROTOCOL_ERROR",
        "protocol",
      ),
    });
  };

/** Fixed metadata only: SDK messages can contain arguments and resource identifiers. */
export function reportPersonaProtocolError(
  logger: LoggerPort | undefined,
  code:
    | "MCP_PROTOCOL_ERROR"
    | "REQUEST_TOO_LARGE"
    | "AUTHORITY_UNAVAILABLE"
    | "AUTHORIZATION_DENIED"
    | "ORIGIN_DENIED"
    | "MCP_REQUEST_FAILED",
  stage: "protocol" | "authentication" | "request",
  rpcCode?: number,
): {
  code: string;
  message: string;
  source: string;
  stage: string;
  supportId: string;
  retryable: false;
} {
  const supportId = randomUUID();
  logger?.warn("persona-v2 request failed", {
    supportId,
    errorCode: code,
    source: "mcp",
    stage,
    ...(rpcCode !== undefined ? { rpcCode } : {}),
  });
  return {
    code,
    message: "Não foi possível concluir a solicitação. Informe o supportId ao responsável.",
    source: "mcp",
    stage,
    supportId,
    retryable: false,
  };
}

function correlatePayload(payload: unknown, logger?: LoggerPort): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const body = payload as Record<string, unknown>;
  const error = body.error;
  const result = body.result as Record<string, unknown> | undefined;
  if (error && typeof error === "object") {
    const rpc = (error as Record<string, unknown>).code;
    const rpcCode =
      typeof rpc === "number" && Number.isSafeInteger(rpc) && rpc >= -32768 && rpc <= -32000
        ? rpc
        : undefined;
    const diagnostic = reportPersonaProtocolError(
      logger,
      "MCP_PROTOCOL_ERROR",
      "protocol",
      rpcCode,
    );
    body.error = { code: rpcCode ?? -32603, message: diagnostic.message, data: diagnostic };
  } else if (result?.isError === true) {
    // Application errors are already correlated by run(); SDK validation errors are not.
    const content = result.content;
    if (
      Array.isArray(content) &&
      content.some((value: unknown) => {
        const item = value as { type?: unknown; text?: unknown } | undefined;
        if (item?.type !== "text" || typeof item.text !== "string") return false;
        try {
          const parsed = JSON.parse(item.text) as { error?: { supportId?: unknown } } | null;
          return typeof parsed?.error?.supportId === "string";
        } catch {
          return false;
        }
      })
    )
      return payload;
    const diagnostic = reportPersonaProtocolError(logger, "MCP_PROTOCOL_ERROR", "protocol");
    body.result = {
      ...result,
      content: [{ type: "text", text: JSON.stringify({ error: diagnostic }) }],
    };
  } else return payload;
  return body;
}

/** Legacy SDK responses use SSE; preserve framing and correlate each response once. */
export async function correlatePersonaProtocolResponse(
  response: Response,
  logger?: LoggerPort,
): Promise<Response> {
  const type = response.headers.get("content-type") ?? "";
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  if (type.includes("application/json"))
    return new Response(JSON.stringify(correlatePayload(await response.json(), logger)), {
      status: response.status,
      headers,
    });
  if (!type.includes("text/event-stream") || !response.body) return response;
  let pending = "";
  const rewrite = (line: string): string => {
    if (!line.startsWith("data: ")) return line;
    let payload: unknown;
    try {
      payload = JSON.parse(line.slice(6));
    } catch {
      return line;
    }
    return "data: " + JSON.stringify(correlatePayload(payload, logger));
  };
  const body = response.body
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(
      new TransformStream<string, string>({
        transform(chunk, controller) {
          pending += chunk;
          let boundary: number;
          while ((boundary = pending.indexOf("\n")) !== -1) {
            controller.enqueue(rewrite(pending.slice(0, boundary)) + "\n");
            pending = pending.slice(boundary + 1);
          }
        },
        flush(controller) {
          if (pending) controller.enqueue(rewrite(pending));
        },
      }),
    )
    .pipeThrough(new TextEncoderStream());
  return new Response(body, { status: response.status, headers });
}
