import { safeErrorDetails } from "../../domain/errors/safe-error-details.js";
import { hasCleanupFailure } from "../../domain/errors/cleanup-failure.js";
import { ExternalFailure } from "../../domain/persona-v2/external-failure.js";
import { FieldUseDenied } from "../../application/persona-v2/query-field-uses.js";
import { FieldContractConflict } from "../../application/persona-v2/field-contract-index.js";
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
  readonly details?: Readonly<Record<string, string | number | boolean>>;
}

export function personaV2ToolError(error: unknown): PersonaV2ToolErrorBody {
  if (error instanceof PersonaV2Error) {
    return {
      code: error.code,
      message: error.message,
      ...(error instanceof ExternalFailure ? { stage: error.stage, details: error.details } : {}),
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
    const details = safeErrorDetails(error.details);
    const protocol =
      error.code === "PLUG_SERVER_ERROR" && error.source === "plug_server_http"
        ? protocolMessages[Number(details.rpcCode)]
        : undefined;
    const published = publicQueryFailure(error.code);
    const diagnostic = safeDiagnostic(error, details);
    return {
      code: error.code,
      message:
        diagnostic?.message ??
        protocol ??
        published?.message ??
        `Não foi possível concluir a consulta (${error.code}, ${error.source ?? "mcp"}).`,
      source: error.source ?? "mcp",
      ...(error.stage ? { stage: error.stage } : {}),
      hint: diagnostic?.hint ?? (protocol ? TRANSPORT_HINT : (published?.hint ?? TRANSPORT_HINT)),
      ...(Object.keys(details).length ? { details } : {}),
      retryable: false,
    };
  }
  return {
    code: "CAPABILITY_UNAVAILABLE",
    message: "Uma falha interna impediu concluir a solicitação.",
    hint: "Informe o supportId ao responsável. Não foi possível determinar a causa; não presuma expiração, ausência de dados ou sucesso da operação.",
    retryable: false,
  };
}

/** Select only fixed diagnostics; upstream text and arbitrary detail fields never become guidance. */
function safeDiagnostic(error: DomainError, details: Record<string, string | number | boolean>) {
  if (details.outcome_unknown === true)
    return {
      message: "Não foi possível confirmar o resultado da operação.",
      hint: "Não execute novamente. Consulte o journal pelo identificador original; ausência de confirmação não comprova rollback. Informe o supportId ao responsável.",
    };
  if (error.code === "CREDENTIAL_STALE" && details.failureCode === "SOURCE_STRUCTURE_MISMATCH")
    return {
      message: "A estrutura da fonte divergiu do contrato esperado na conexão executora.",
      hint: "Peça revisão da estrutura e da publicação ao responsável. Não contorne a guarda nem repita automaticamente; informe o supportId.",
    };
  if (error.source === "plug_server_http") {
    const message: string | undefined = {
      [-32014]: "O hub detectou repetição do identificador do comando.",
      [-32104]: "O pool de conexões do agente está esgotado.",
      [-32106]: "O agente não conseguiu conectar ao banco.",
      [-32108]: "A configuração de banco do agente foi recusada.",
      [-32109]: "A execução consultada não foi encontrada no agente.",
      [-32110]: "O agente informou cancelamento da execução.",
    }[Number(details.rpcCode)];
    if (message)
      return {
        message,
        hint: "Informe o supportId ao responsável. Não altere SQL, credenciais ou identificadores para reenviar. Ausência ou cancelamento não comprovam rollback; para operações, consulte o estado original e a conciliação autorizada.",
      };
  }
  if (error.source === "plug_server_http" && details.rpcCode === undefined) {
    if (error.code === "PLUG_SERVER_ERROR" && details.httpStatus === 404)
      return {
        message: "O hub respondeu HTTP 404; o recurso solicitado não foi encontrado.",
        hint: "O status isolado não comprova histórico de registro do agente, desconexão ou revogação. Informe o supportId ao responsável para conferir rota e referência; não altere SQL, peça reconexão ou repita automaticamente.",
      };
    if (error.code === "PLUG_SERVER_ERROR" && details.httpStatus === 403)
      return {
        message: "O hub recusou a solicitação HTTP 403.",
        hint: "O status isolado não identifica a conta ou concessão afetada. Informe o supportId ao responsável; não presuma Client inativo, revogação ou expiração OAuth, nem repita automaticamente.",
      };
    if (error.code === "AGENT_UNAVAILABLE" && details.httpStatus === 503)
      return {
        message: "O hub respondeu HTTP 503; não foi possível concluir a solicitação.",
        hint: "O status isolado não distingue saturação, proxy ou indisponibilidade do agente. Informe o supportId ao responsável; não altere SQL, peça reconexão ou repita automaticamente.",
      };
    if (error.code === "PLUG_SERVER_ERROR" && details.httpStatus === 400)
      return {
        message: "O hub recusou o pedido HTTP 400; isso não comprova erro do motor SQL.",
        hint: "Peça revisão do contrato da requisição ao responsável e informe o supportId. Não altere SQL nem repita automaticamente.",
      };
  }
  if (error.code !== "PLUG_SERVER_ERROR" || error.source !== "plug_server_http") return undefined;
  const message = {
    capacity: "O limite de chamadas simultâneas ao hub foi atingido; este pedido não foi enviado.",
    timeout: "O prazo de comunicação com o hub terminou antes da conclusão da resposta.",
    network: "A conexão com o hub falhou antes da conclusão da resposta.",
    invalid_response:
      "O hub devolveu uma resposta inválida ou incompleta; ela não foi aceita como resultado.",
  }[String(details.transportReason)];
  return message
    ? {
        message,
        hint: "Informe o supportId e a etapa ao responsável. Não peça reconexão, altere o SQL ou repita automaticamente. Se houve envio, a execução pode continuar no agente.",
      }
    : undefined;
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
    ...(hasCleanupFailure(error) ? { cleanupFailed: true } : {}),
    ...(error instanceof FieldUseDenied ? { fieldUseReason: error.reason } : {}),
    ...(error instanceof FieldContractConflict
      ? {
          publicationIds: [error.first.id, error.second.id],
          publicationRevisions: [error.first.revision, error.second.revision],
          columnIndex: error.columnIndex,
          policyAttributes: error.attributes,
        }
      : {}),
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
                : safeAuthorizationReason === "access_expired"
                  ? "O cliente OAuth deve renovar o access token automaticamente com o refresh token."
                  : ["grant_revoked", "grant_expired"].includes(safeAuthorizationReason)
                    ? "A concessão OAuth terminou. Autorize uma nova conexão no navegador."
                    : ["token_revoked", "token_expired", "authorization_changed"].includes(
                          safeAuthorizationReason,
                        )
                      ? "Confira a validade e a autorização do token da persona com o responsável antes de autorizar nova conexão."
                      : "Confira a credencial da conexão e informe o supportId ao responsável.",
          retryable: false as const,
        }
      : {}),
    supportId,
  };
}
