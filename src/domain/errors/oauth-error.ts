import { DomainError } from "./domain-error.js";
import { ERROR_CODES } from "./error-codes.js";

export class OAuthError extends Error {
  constructor(
    readonly code: string,
    readonly status = 400,
  ) {
    super(code);
    this.name = "OAuthError";
  }
}
export const oauthUnauthorized = (): DomainError =>
  new DomainError({
    code: ERROR_CODES.UNAUTHENTICATED,
    message: "Conexão ChatGPT inválida, expirada ou revogada.",
    hint: "Reconecte Se7e no ChatGPT e confirme a persona no navegador.",
    source: "mcp",
    stage: "oauth",
  });
