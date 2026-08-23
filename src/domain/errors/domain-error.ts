import { ERROR_CODES, type ErrorCode } from "./error-codes.js";

export interface DomainErrorJson {
  readonly success: false;
  readonly error: {
    readonly code: ErrorCode;
    readonly message: string;
    readonly hint: string;
    readonly retryable: boolean;
    readonly retryAfterMs: number | null;
  };
}

export class DomainError extends Error {
  readonly code: ErrorCode;
  readonly hint: string;
  readonly retryable: boolean;
  readonly retryAfterMs: number | null;

  constructor(input: {
    code: ErrorCode;
    message: string;
    hint: string;
    retryable?: boolean;
    retryAfterMs?: number | null;
  }) {
    super(input.message);
    this.name = "DomainError";
    this.code = input.code;
    this.hint = input.hint;
    this.retryable = input.retryable ?? false;
    this.retryAfterMs = input.retryAfterMs ?? null;
  }

  toJson(): DomainErrorJson {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.message,
        hint: this.hint,
        retryable: this.retryable,
        retryAfterMs: this.retryAfterMs,
      },
    };
  }

  static unauthenticated(): DomainError {
    return new DomainError({
      code: ERROR_CODES.UNAUTHENTICATED,
      message: "Token MCP ausente ou inválido.",
      hint: "Chame registrar_acesso sem Bearer, abra o setupCode em GET /setup/{code}, copie o token e envie Authorization: Bearer.",
    });
  }
}

export const isDomainError = (error: unknown): error is DomainError => error instanceof DomainError;
