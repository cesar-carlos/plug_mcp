import { ERROR_CODES, type ErrorCode } from "./error-codes.js";
import { guidanceFor } from "./error-next-action.js";

/** Origem visível à IA: pacote vs motor vs policy vs HTTP vs acesso vs rate limit local. */
export const ERROR_SOURCE = {
  sql: "sql",
  sqlEngine: "sql_engine",
  http: "plug_server_http",
  access: "client_agent_access",
  policy: "client_token_rpc",
  mcp: "mcp",
} as const;

export type ErrorSource = (typeof ERROR_SOURCE)[keyof typeof ERROR_SOURCE];

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
    const guide = guidanceFor(this.code, this.source, this.stage);
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

  /** Allowlist/teto de mídia no MCP (`source: mcp`, `stage: anexo`). */
  static anexo(input: {
    code: ErrorCode;
    message: string;
    hint: string;
    retryable?: boolean;
    retryAfterMs?: number | null;
    category?: string;
    nextAction?: string;
    documentationUrl?: string;
    details?: unknown;
  }): DomainError {
    return new DomainError({
      ...input,
      source: ERROR_SOURCE.mcp,
      stage: "anexo",
    });
  }

  /** Recusa do validador fail-closed do pacote (`source: sql`). */
  static pacote(input: {
    code: ErrorCode;
    message: string;
    hint: string;
    retryable?: boolean;
    retryAfterMs?: number | null;
    stage?: string;
    category?: string;
    nextAction?: string;
    documentationUrl?: string;
    details?: unknown;
  }): DomainError {
    return new DomainError({
      ...input,
      source: ERROR_SOURCE.sql,
      stage: input.stage ?? "validar_escopo",
    });
  }

  /** Substitui só o hint; preserva code/source/stage/details (origem hub vs pacote). */
  withHint(hint: string): DomainError {
    return new DomainError({
      code: this.code,
      message: this.message,
      hint,
      retryable: this.retryable,
      retryAfterMs: this.retryAfterMs,
      source: this.source,
      stage: this.stage,
      category: this.category,
      nextAction: this.nextAction,
      documentationUrl: this.documentationUrl,
      details: this.details,
    });
  }
}

export const isDomainError = (error: unknown): error is DomainError => error instanceof DomainError;
