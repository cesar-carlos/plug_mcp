import { DomainError } from "../../domain/errors/domain-error.js";
import { publicQueryFailure } from "../../domain/errors/public-query-failure.js";
import { PersonaV2Error } from "../../domain/persona-v2/model.js";

const TRANSPORT_HINT =
  "Confira code/source. Falha de transporte não autoriza reescrever SQL; não repita automaticamente.";

export interface PersonaV2ToolErrorBody {
  readonly code: string;
  readonly message: string;
  readonly source?: string;
  readonly stage?: string;
  readonly hint?: string;
  readonly retryable?: false;
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
    const published = publicQueryFailure(error.code);
    return {
      code: error.code,
      message:
        published?.message ??
        `Não foi possível concluir a consulta (${error.code}, ${error.source ?? "mcp"}).`,
      source: error.source ?? "mcp",
      ...(error.stage ? { stage: error.stage } : {}),
      hint: published?.hint ?? TRANSPORT_HINT,
      retryable: false,
    };
  }
  return { code: "CAPABILITY_UNAVAILABLE", message: "Serviço indisponível." };
}
