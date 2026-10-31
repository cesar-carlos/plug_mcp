import { DomainError } from "../errors/domain-error.js";

/** Metadata from the authorized publications, for internal support logs only. */
export class SourceExecutionError extends DomainError {
  constructor(
    error: DomainError,
    readonly queryOrigin: "modelo_publicado" | "sql_fornecido",
    readonly publicationIds: readonly string[],
  ) {
    super({ ...error, message: error.message });
    this.cause = error;
  }
}
