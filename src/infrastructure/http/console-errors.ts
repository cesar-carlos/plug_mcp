import type { Response } from "express";
import { DomainError, isDomainError } from "../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../domain/errors/error-codes.js";

export const wantsJson = (accept: string | undefined): boolean =>
  (accept ?? "").toLowerCase().includes("application/json");

export const httpStatusFor = (error: DomainError): number => {
  switch (error.code) {
    case ERROR_CODES.UNAUTHENTICATED:
    case ERROR_CODES.USER_AUTH_EXPIRED:
      return 401;
    case ERROR_CODES.PERMISSION_DENIED:
    case ERROR_CODES.ACCESS_REVOKED:
    case ERROR_CODES.AGENT_ACCESS_DENIED:
      return 403;
    case ERROR_CODES.CONFLICT:
    case ERROR_CODES.CREDENTIAL_STALE:
    case ERROR_CODES.CLIENT_NOT_ACTIVE:
    case ERROR_CODES.AGENT_ACCESS_PENDING:
      return 409;
    case ERROR_CODES.RATE_LIMITED:
      return 429;
    case ERROR_CODES.FEATURE_DESLIGADA:
    case ERROR_CODES.PLUG_SERVER_TIMEOUT:
    case ERROR_CODES.AGENT_UNAVAILABLE:
      return 503;
    default:
      return 400;
  }
};

export const sendDomainError = (res: Response, error: DomainError): void => {
  const envelope = error.toJson();
  res.status(httpStatusFor(error)).json({
    success: false,
    code: envelope.error.code,
    message: envelope.error.message,
    hint: envelope.error.hint,
    error: envelope.error,
  });
};

export const sendCaughtError = (res: Response, error: unknown): void => {
  if (isDomainError(error)) {
    sendDomainError(res, error);
    return;
  }
  sendDomainError(
    res,
    new DomainError({
      code: ERROR_CODES.VALIDATION_ERROR,
      message: "Operação inválida, expirada ou não autorizada.",
      hint: "Gere uma nova URL de operação e confirme no navegador.",
    }),
  );
};
