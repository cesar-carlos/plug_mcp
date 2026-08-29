import { ERROR_CODES, type ErrorCode } from "./error-codes.js";
import { guidanceFor } from "./error-next-action.js";

export interface DomainErrorJson {
  readonly success: false;
  readonly error: {
    readonly code: ErrorCode;
    readonly message: string;
    readonly hint: string;
    readonly retryable: boolean;
    readonly retryAfterMs: number | null;
    readonly source?: string;
    readonly stage?: string;
    readonly category?: string;
    readonly nextAction?: string;
    readonly documentationUrl?: string;
    readonly details?: unknown;
  };
}

export class DomainError extends Error {
  readonly code: ErrorCode;
  readonly hint: string;
  readonly retryable: boolean;
  readonly retryAfterMs: number | null;
  readonly source?: string;
  readonly stage?: string;
  readonly category?: string;
  readonly nextAction?: string;
  readonly documentationUrl?: string;
  readonly details?: unknown;

  constructor(input: {
    code: ErrorCode;
    message: string;
    hint: string;
    retryable?: boolean;
    retryAfterMs?: number | null;
    source?: string;
    stage?: string;
    category?: string;
    nextAction?: string;
    documentationUrl?: string;
    details?: unknown;
  }) {
    super(input.message);
    this.name = "DomainError";
    this.code = input.code;
    this.hint = input.hint;
    this.retryable = input.retryable ?? false;
    this.retryAfterMs = input.retryAfterMs ?? null;
    this.source = input.source;
    this.stage = input.stage;
    this.category = input.category;
    this.nextAction = input.nextAction;
    this.documentationUrl = input.documentationUrl;
    this.details = input.details;
  }

  toJson(): DomainErrorJson {
    const guide = guidanceFor(this.code, this.source);
    const error: DomainErrorJson["error"] = {
      code: this.code,
      message: this.message,
      hint: this.hint,
      retryable: this.retryable,
      retryAfterMs: this.retryAfterMs,
    };
    const source = this.source;
    const stage = this.stage;
    const category = this.category ?? guide?.category;
    const nextAction = this.nextAction ?? guide?.nextAction;
    const documentationUrl = this.documentationUrl ?? guide?.documentationUrl;
    return {
      success: false,
      error: {
        ...error,
        ...(source ? { source } : {}),
        ...(stage ? { stage } : {}),
        ...(category ? { category } : {}),
        ...(nextAction ? { nextAction } : {}),
        ...(documentationUrl ? { documentationUrl } : {}),
        ...(this.details !== undefined ? { details: this.details } : {}),
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
