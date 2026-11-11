import { randomUUID } from "node:crypto";
import type { LoggerPort } from "../../domain/ports/logger.port.js";
import type { ErrorRequestHandler } from "express";

export interface CorrelatedToolFailure extends Record<string, unknown> {
  isError: true;
  content: [{ type: "text"; text: string }];
  _meta?: { "mcp/www_authenticate": string[] };
}

export interface ProtocolToolContext {
  readonly tool: string;
  readonly rejectedInput?: () => { field?: string } | undefined;
  readonly optionsReason?: () => string | undefined;
  readonly fields: readonly string[];
}

interface DiagnosticMetadata {
  readonly protocolOrigin: "http_parser" | "sdk_rpc" | "sdk_tool_result" | "sdk_tool_input";
  readonly tool?: string;
  readonly optionsReason?: string;
  readonly rejectedField?: string;
}

// The SDK formats Standard Schema issues as "path: message". Emit only a
// top-level name declared by this registered tool, never the SDK text or path.
function sdkMetadata(
  origin: "sdk_rpc" | "sdk_tool_result",
  message: unknown,
  context?: ProtocolToolContext,
): DiagnosticMetadata {
  if (!context) return { protocolOrigin: origin };
  const { tool, fields } = context;
  const observed = context.rejectedInput?.();
  if (observed) {
    const rejectedField = observed.field;
    const optionsReason = rejectedField === "options" ? context.optionsReason?.() : undefined;
    return {
      protocolOrigin: "sdk_tool_input",
      tool,
      ...(rejectedField ? { rejectedField } : {}),
      ...(optionsReason ? { optionsReason } : {}),
    };
  }
  if (context.rejectedInput) return { protocolOrigin: origin, tool };
  const prefix = "Input validation error: Invalid arguments for tool " + tool + ": ";
  if (typeof message !== "string" || !message.startsWith(prefix))
    return { protocolOrigin: origin, tool };
  const issue = message.slice(prefix.length);
  const rejectedField = fields.find(
    (field) => issue.startsWith(field + ": ") || issue.startsWith(field + "."),
  );
  const optionsReason = rejectedField === "options" ? context.optionsReason?.() : undefined;
  return {
    ...(optionsReason ? { optionsReason } : {}),
    protocolOrigin: "sdk_tool_input",
    tool,
    ...(rejectedField ? { rejectedField } : {}),
  };
}

export const personaMcpParserError =
  (logger?: LoggerPort): ErrorRequestHandler =>
  (error, req, res, next) => {
    if (!["/mcp", "/mcp/chatgpt"].includes(req.path)) {
      next(error);
      return;
    }
    const status =
      (error as { type?: unknown } | undefined)?.type === "entity.too.large" ? 413 : 400;
    const diagnostic = reportPersonaProtocolError(
      logger,
      status === 413 ? "REQUEST_TOO_LARGE" : "MCP_PROTOCOL_ERROR",
      "protocol",
      undefined,
      { protocolOrigin: "http_parser" },
    );
    res.setHeader("X-Support-Id", diagnostic.supportId);
    res.status(status).json({ error: diagnostic });
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
  metadata?: DiagnosticMetadata,
): {
  code: string;
  message: string;
  source: string;
  stage: string;
  supportId: string;
  retryable: false;
  rejectedField?: string;
} {
  const supportId = randomUUID();
  logger?.warn("persona-v2 request failed", {
    supportId,
    errorCode: code,
    source: "mcp",
    stage,
    ...metadata,
    ...(rpcCode !== undefined ? { rpcCode } : {}),
  });
  const invalidOptions =
    metadata?.protocolOrigin === "sdk_tool_input" &&
    (metadata.tool === "validar_consulta" || metadata.tool === "consultar_dados") &&
    metadata.rejectedField === "options";
  const reportField =
    metadata?.protocolOrigin === "sdk_tool_input" &&
    metadata.tool === "reportar_erro_interacao" &&
    [
      "error",
      "error.code",
      "error.message",
      "error.supportId",
      "error.source",
      "error.stage",
      "error.tool",
    ].includes(metadata.rejectedField ?? "")
      ? metadata.rejectedField
      : undefined;
  return {
    code,
    ...(invalidOptions
      ? { rejectedField: "options" }
      : reportField
        ? { rejectedField: reportField }
        : {}),
    message: invalidOptions
      ? metadata.tool +
        " recusou o campo options. " +
        (metadata.optionsReason ? metadata.optionsReason + " " : "") +
        'Omita options se não precisar de limites ou paginação. Se usar options, envie um objeto com inteiros positivos nos limites do schema. As chaves aceitas são maxRows, maxBytes, timeoutMs, page e pageSize. Para paginar, informe page e pageSize juntos, por exemplo {"options":{"page":1,"pageSize":50}}.'
      : reportField
        ? "O relato foi recusado no campo " +
          reportField +
          ". Confira o formato desse campo no contrato da ferramenta."
        : "Não foi possível concluir a solicitação. Informe o supportId ao responsável.",
    source: "mcp",
    stage,
    supportId,
    retryable: false,
  };
}

function correlatePayload(
  payload: unknown,
  logger?: LoggerPort,
  context?: ProtocolToolContext,
  failure?: CorrelatedToolFailure,
): unknown {
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
      sdkMetadata("sdk_rpc", (error as Record<string, unknown>).message, context),
    );
    body.error = { code: rpcCode ?? -32603, message: diagnostic.message, data: diagnostic };
  } else if (result?.isError === true) {
    const content = result.content;
    const first = Array.isArray(content)
      ? (content[0] as { type?: unknown; text?: unknown } | undefined)
      : undefined;
    // Only the diagnostic produced by this request may preserve its OAuth challenge.
    if (failure && first?.type === "text" && first.text === failure.content[0].text) {
      body.result = failure;
      return body;
    }
    const diagnostic = reportPersonaProtocolError(
      logger,
      "MCP_PROTOCOL_ERROR",
      "protocol",
      undefined,
      sdkMetadata("sdk_tool_result", first?.type === "text" ? first.text : undefined, context),
    );
    body.result = {
      isError: true,
      content: [{ type: "text", text: JSON.stringify({ error: diagnostic }) }],
    };
  } else return payload;
  return body;
}

/** Legacy SDK responses use SSE; preserve framing and correlate each response once. */
export async function correlatePersonaProtocolResponse(
  response: Response,
  logger?: LoggerPort,
  context?: ProtocolToolContext,
  getFailure?: () => CorrelatedToolFailure | undefined,
): Promise<Response> {
  const type = response.headers.get("content-type") ?? "";
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  if (type.includes("application/json"))
    return new Response(
      JSON.stringify(correlatePayload(await response.json(), logger, context, getFailure?.())),
      {
        status: response.status,
        headers,
      },
    );
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
    return "data: " + JSON.stringify(correlatePayload(payload, logger, context, getFailure?.()));
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
