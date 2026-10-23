import { DomainError, ERROR_SOURCE } from "../../../domain/errors/domain-error.js";
import { PersonaV2Error } from "../../../domain/persona-v2/model.js";

/** Operator diagnostics never serialize upstream messages, details, stack or credentials. */
export function publicationCliFailure(error: unknown): {
  approved: false;
  code: string;
  message: string;
  repeatAllowed: false;
  source?: string;
  retryAfterMs?: number;
} {
  const source =
    error instanceof DomainError &&
    Object.values(ERROR_SOURCE).some((value) => value === error.source)
      ? error.source
      : undefined;
  const retryAfterMs =
    error instanceof DomainError &&
    error.code === "RATE_LIMITED" &&
    typeof error.retryAfterMs === "number" &&
    Number.isFinite(error.retryAfterMs) &&
    error.retryAfterMs >= 0 &&
    error.retryAfterMs <= 86_400_000
      ? error.retryAfterMs
      : undefined;
  return {
    approved: false as const,
    code:
      error instanceof DomainError || error instanceof PersonaV2Error
        ? error.code
        : "RUNNER_FAILED",
    message:
      "Publicação não aprovada. Verifique manifesto de fixture, contrato, casos e portões; não repita efeitos incertos.",
    repeatAllowed: false as const,
    ...(source ? { source } : {}),
    ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
  };
}
