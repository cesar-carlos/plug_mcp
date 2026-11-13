import { randomUUID } from "node:crypto";
import { PersonaV2Error } from "../../domain/persona-v2/model.js";
import type { LoggerPort } from "../../domain/ports/logger.port.js";

/** Authentication only. Never copy native messages, credentials or client identifiers. */
export function personaAuthenticationFailure(
  error: unknown,
  authenticationMode: "oauth" | "bearer",
  logger?: LoggerPort,
): {
  status: 401 | 503;
  challengeType: "none" | "bearer" | "oauth_discovery" | "oauth_invalid_token";
  body: {
    code: string;
    message: string;
    hint: string;
    source: "mcp";
    stage: "authentication";
    supportId: string;
    retryable: false;
    details: { authenticationMode: "oauth" | "bearer"; authorizationReason: string };
  };
} {
  const inputReason =
    error === "credential_missing" || error === "credential_malformed" ? error : undefined;
  const denied =
    !!inputReason ||
    (error instanceof PersonaV2Error &&
      ["AUTHORIZATION_DENIED", "STALE_AUTHORIZATION"].includes(error.code));
  const known = error instanceof PersonaV2Error ? error.authorizationReason : undefined;
  const authorizationReason =
    inputReason ??
    (!denied
      ? "authentication_unavailable"
      : known &&
          [
            "access_expired",
            "grant_expired",
            "grant_revoked",
            "token_expired",
            "token_revoked",
            "authorization_changed",
            "identity_invalid",
            "oauth_client_unavailable",
          ].includes(known)
        ? known
        : "authorization_unknown");
  const challengeType = !denied
    ? "none"
    : authenticationMode === "bearer"
      ? "bearer"
      : inputReason
        ? "oauth_discovery"
        : "oauth_invalid_token";
  const supportId = randomUUID();
  const code = !denied
    ? "AUTHORITY_UNAVAILABLE"
    : error instanceof PersonaV2Error
      ? error.code
      : "AUTHORIZATION_DENIED";
  let hint =
    "Informe o supportId ao responsável. A recusa não comprova expiração; não peça reconexão automaticamente nem envie segredos no chat.";
  if (authorizationReason === "authentication_unavailable")
    hint =
      "Não foi possível conferir a autorização agora. Não peça reconexão nem repita a consulta automaticamente; informe o supportId ao responsável.";
  else if (authorizationReason === "access_expired" && authenticationMode === "oauth")
    hint =
      "O cliente OAuth deve renovar o access token com o refresh token, quando disponível, sem solicitar reconexão. Não envie tokens no chat.";
  else if (
    [
      "grant_expired",
      "grant_revoked",
      "authorization_changed",
      "token_expired",
      "token_revoked",
    ].includes(authorizationReason)
  )
    hint =
      "A autorização deixou de ser vigente. Confira a concessão com o responsável antes de autorizar uma nova conexão no navegador; refresh não amplia permissões.";
  else if (authorizationReason === "oauth_client_unavailable")
    hint =
      "O cliente OAuth não está autorizado na configuração atual. Peça revisão ao responsável; reconectar não corrige essa configuração.";
  logger?.warn("persona-v2 authentication failed", {
    supportId,
    errorCode: code,
    source: "mcp",
    stage: "authentication",
    authenticationMode,
    authorizationReason,
    challengeType,
  });
  return {
    status: denied ? 401 : 503,
    challengeType,
    body: {
      code,
      message: denied
        ? "A credencial da solicitação não pôde ser autorizada."
        : "Serviço de autorização temporariamente indisponível.",
      hint,
      source: "mcp",
      stage: "authentication",
      supportId,
      retryable: false as const,
      details: { authenticationMode, authorizationReason },
    },
  };
}
