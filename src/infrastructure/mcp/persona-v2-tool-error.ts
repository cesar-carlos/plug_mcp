import { randomUUID } from "node:crypto";
import type { LoggerPort } from "../../domain/ports/logger.port.js";
import { DomainError } from "../../domain/errors/domain-error.js";
import { publicQueryFailure } from "../../domain/errors/public-query-failure.js";
import { PersonaV2Error } from "../../domain/persona-v2/model.js";
import { SourceExecutionError } from "../../domain/persona-v2/source-execution-error.js";

const TRANSPORT_HINT =
  "Confira code/source. Falha de transporte não autoriza reescrever SQL; não repita automaticamente.";

export interface PersonaV2ToolErrorBody {
  readonly code: string;
  readonly message: string;
  readonly source?: string;
  readonly stage?: string;
  readonly hint?: string;
  readonly retryable?: false;
  readonly details?: Readonly<Record<string, string | number>>;
}

export function personaV2ToolError(error: unknown): PersonaV2ToolErrorBody {
  if (error instanceof PersonaV2Error) {
    return {
      code: error.code,
      message: error.message,
      ...(error.source
        ? { source: error.source, hint: error.hint, retryable: false as const }
        : {}),
    };
  }
  if (error instanceof DomainError && error.source === "sql") {
    return {
      code: error.code,
      message: error.message,
      source: error.source,
      ...(error.stage ? { stage: error.stage } : {}),
      hint: error.hint,
      retryable: false,
    };
  }
  if (error instanceof DomainError) {
    const details = safeDetails(error.details);
    const protocol =
      error.code === "PLUG_SERVER_ERROR" && error.source === "plug_server_http"
        ? protocolMessages[Number(details.rpcCode)]
        : undefined;
    const published = publicQueryFailure(error.code);
    return {
      code: error.code,
      message:
        protocol ??
        published?.message ??
        `Não foi possível concluir a consulta (${error.code}, ${error.source ?? "mcp"}).`,
      source: error.source ?? "mcp",
      ...(error.stage ? { stage: error.stage } : {}),
      hint: protocol ? TRANSPORT_HINT : (published?.hint ?? TRANSPORT_HINT),
      ...(Object.keys(details).length ? { details } : {}),
      retryable: false,
    };
  }
  return { code: "CAPABILITY_UNAVAILABLE", message: "Serviço indisponível." };
}

const protocolMessages: Partial<Record<number, string>> = {
  [-32700]: "O hub recusou o JSON-RPC: conteúdo inválido.",
  [-32600]: "O hub recusou o JSON-RPC: requisição inválida.",
  [-32601]: "O hub recusou o JSON-RPC: método não encontrado.",
  [-32602]: "O hub recusou o JSON-RPC: parâmetros inválidos.",
  [-32603]: "O hub informou uma falha interna no processamento JSON-RPC.",
  [-32009]: "O hub recusou o formato ou a assinatura do payload.",
  [-32010]: "O hub não conseguiu decodificar o payload do agente.",
  [-32011]: "O hub não conseguiu descomprimir o payload do agente.",
  [-32012]: "Falha de rede entre o hub e o agente.",
};
const reasons = new Set([
  "invalid_params",
  "invalid_request",
  "method_not_found",
  "parse_error",
  "internal_error",
  "missing_client_token",
  "invalid_signature",
  "authentication_failed",
  "invalid_payload",
]);
const errnos = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
  "CERT_HAS_EXPIRED",
]);
/** Positive allowlist: never copy upstream message, SQL, identifiers, payload or nested objects. */
function safeDetails(value: unknown): Record<string, string | number> {
  if (!value || typeof value !== "object") return {};
  const raw = value as Record<string, unknown>;
  const result: Record<string, string | number> = {};
  if (
    typeof raw.rpcCode === "number" &&
    Number.isSafeInteger(raw.rpcCode) &&
    raw.rpcCode >= -32768 &&
    raw.rpcCode <= -32000
  )
    result.rpcCode = raw.rpcCode;
  if (typeof raw.reason === "string" && reasons.has(raw.reason)) result.reason = raw.reason;
  if (typeof raw.errno === "string" && errnos.has(raw.errno)) result.errno = raw.errno;
  if (typeof raw.sqlstate === "string" && /^[0-9A-Z]{5}$/.test(raw.sqlstate))
    result.sqlstate = raw.sqlstate;
  return result;
}

/** Each failed tool invocation gets a server-owned ID; logs contain diagnostic metadata only. */
export function reportPersonaV2ToolError(
  error: unknown,
  logger?: LoggerPort,
  authorizationReason?: string,
): PersonaV2ToolErrorBody & { readonly supportId: string } {
  const body = personaV2ToolError(error);
  const candidate =
    authorizationReason ??
    (error instanceof PersonaV2Error ? error.authorizationReason : undefined);
  const safeAuthorizationReason =
    error instanceof PersonaV2Error &&
    ["AUTHORIZATION_DENIED", "STALE_AUTHORIZATION"].includes(error.code) &&
    candidate &&
    [
      "token_expired",
      "token_revoked",
      "authorization_changed",
      "access_expired",
      "grant_expired",
      "grant_revoked",
      "identity_invalid",
      "permission_denied",
      "authentication_unavailable",
    ].includes(candidate)
      ? candidate
      : undefined;
  const supportId = randomUUID();
  const aggregationReason =
    error instanceof DomainError &&
    error.code === "AGREGACAO_INSEGURA" &&
    error.source === "sql" &&
    error.details &&
    typeof error.details === "object"
      ? (error.details as Record<string, unknown>).aggregationReason
      : undefined;
  const safeAggregationReason =
    typeof aggregationReason === "string" &&
    [
      "invalid_declared_grain",
      "join_grain_unproven",
      "relationship_unproven",
      "measure_multiplication",
    ].includes(aggregationReason)
      ? aggregationReason
      : undefined;
  logger?.warn("persona-v2 tool failed", {
    supportId,
    errorCode: body.code,
    ...(error instanceof SourceExecutionError
      ? { queryOrigin: error.queryOrigin, publicationIds: error.publicationIds }
      : {}),
    ...(safeAuthorizationReason ? { authorizationReason: safeAuthorizationReason } : {}),
    ...(safeAggregationReason ? { aggregationReason: safeAggregationReason } : {}),
    source: body.source,
    stage: body.stage,
    details: body.details,
  });
  return {
    ...body,
    ...(safeAuthorizationReason
      ? {
          details: { ...body.details, authorizationReason: safeAuthorizationReason },
          hint:
            safeAuthorizationReason === "permission_denied"
              ? "Conexão válida. Confira as permissões e a disponibilidade do recurso com o responsável; reconectar não concede acesso."
              : safeAuthorizationReason === "authentication_unavailable"
                ? "Não foi possível conferir a conexão. Isso não comprova expiração; informe o supportId ao responsável."
                : "A autenticação precisa ser renovada pelo cliente OAuth; reconecte somente se a renovação não resolver.",
          retryable: false as const,
        }
      : {}),
    supportId,
  };
}
