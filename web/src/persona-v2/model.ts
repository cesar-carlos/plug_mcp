import type { OperationPackage } from "../../../src/domain/persona-v2/operation-training";
export type Dialect = "mssql" | "postgres" | "sybase" | "firebird";
export interface Persona {
  id: string;
  active: boolean;
  name: string;
  specialty: string;
  instructions: string;
  authorizationVersion: number;
}
export interface ImportedDraftReference {
  personaId: string;
  skillId: string;
  name: string;
}
export interface SourceRestriction {
  table: string;
  column: string;
  parameter: string;
  value: string | number | boolean;
}
export interface Source {
  replacedBySourceId?: string | null;
  id: string;
  name: string;
  purpose: string;
  dialect: Dialect;
  database: string;
  environment: string;
  agentId: string;
  active: boolean;
  authorizationVersion: number;
  identityVerifiedAt?: string;
  rowRestrictions?: SourceRestriction[];
}
export interface Training {
  binaryAttachments?: {
    table: string;
    column: string;
    mimeTypes: (
      "application/octet-stream" | "application/pdf" | "image/png" | "image/jpeg" | "image/webp"
    )[];
    maxBytes: number;
    ttlMs: number;
  };
  attachments?: { format: "json"; maxBytes: number; ttlMs: number };
  limits?: Partial<QueryLimits>;
  sharedKnowledge?: {
    catalogId: string;
    publicationId: string;
    evidenceId: string;
    profilePublicationId?: string;
  };
  sourceId: string;
  dialect: Dialect;
  purpose: string;
  sqlModel: string;
  examples?: {
    id: string;
    purpose: string;
    sql: string;
    explanation: string;
    state?: "candidate" | "approved" | "inactive" | "replaced";
  }[];
  tables: { name: string; meaning: string; grain: string[]; resourceType?: "table" | "view" }[];
  columns: {
    table: string;
    name: string;
    meaning: string;
    classification: string;
    uses?: ("projecao" | "filtro" | "join" | "agrupamento" | "ordenacao" | "exportacao")[];
    usePurpose?: string;
  }[];
  relationships: {
    id?: string;
    via?: string[];
    path?: string[];
    from: string;
    to: string;
    keys: { from: string; to: string }[];
    join: "inner" | "left";
    cardinality: "1:1" | "1:N" | "N:1" | "N:N";
    meaning: string;
  }[];
  rules: string[];
  parameters: { name: string; type: string; required: boolean; meaning: string }[];
}
export interface Draft {
  id: string;
  name: string;
  slug: string;
  kind: string;
  revision: number;
  training: Training;
  activePublicationId: string | null;
}
export interface Publication {
  id: string;
  revision: number;
  suspendedAt: string | null;
  hash: string;
  package: {
    format: string;
    name: string;
    sourceId: string;
    requiredCapabilities: string[];
    sqlModel: string;
    training: Training;
  };
}
export interface GrantPublication {
  id: string;
  revision: number;
  suspendedAt: string | null;
  hash: string;
  package: {
    format: string;
    name: string;
    dialect?: OperationPackage["dialect"];
    training?:
      | Training
      | OperationPackage["training"]
      | { operationId: string; effect: "consulta" | "acao" };
    sharedKnowledge?: OperationPackage["sharedKnowledge"];
    sourceId?: string;
    requiredCapabilities: string[];
    dependencies?: { skillId: string; publicationId: string; hash: string; sourceId: string }[];
  };
}
export interface Preview {
  reviewDueAt: string;
  review?: PublicationPreviewResult["review"];
  confirmationHash: string;
  expiresAt: string;
  revision: number;
  warnings: string[];
  diff: { addedCapabilities: string[]; removedCapabilities: string[]; changedFields: string[] };
  package: Publication["package"];
}
export interface QueryResult {
  reuse?: { kind: "fresh" | "cache" | "singleflight" };
  limits?: QueryLimits;
  columns: string[];
  rows: Record<string, unknown>[];
  completeness: { complete: boolean; truncated: boolean };
  provenance: {
    sourceId: string;
    dialect: Dialect;
    readAt: string;
    publications: { id: string; hash: string }[];
  };
  pagination?: { page: number; hasNextPage: boolean };
}
export const emptyTraining = (): Training => ({
  sourceId: "",
  dialect: "mssql",
  purpose: "",
  sqlModel: "",
  tables: [],
  columns: [],
  relationships: [],
  rules: [],
  parameters: [],
});

export class ConsoleRequestError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
    readonly fields: readonly string[] = [],
  ) {
    super(message);
  }
}

export const MCP_TOKEN_REFUSED_MESSAGE =
  "O token foi recusado. Confira se ainda é válido, não expirou e tem concessão para esta persona. Não reenvie automaticamente.";

/** A request from a discarded persona/session cannot update the current screen. */
export class ContextRequests {
  private version = 0;
  private controller = new AbortController();
  reset(): void {
    this.version++;
    this.controller.abort();
    this.controller = new AbortController();
  }
  async json<T>(url: string, init: RequestInit = {}, format: "json" | "mcp" = "json"): Promise<T> {
    const version = this.version;
    const changesState = !["GET", "HEAD", "OPTIONS"].includes((init.method ?? "GET").toUpperCase());
    const transportFailure = () => {
      if (version !== this.version)
        return new Error("O contexto mudou. A resposta anterior foi descartada.");
      return changesState
        ? new ConsoleRequestError(
            "Não foi possível confirmar o resultado. Confira o estado pela listagem ou pelo identificador antes de qualquer nova tentativa. Não reenvie automaticamente.",
            "RESPONSE_UNCONFIRMED",
            0,
          )
        : new Error("Resposta inválida do servidor. Tente novamente após verificar a conexão.");
    };
    let response: Response;
    try {
      response = await fetch(url, {
        ...init,
        credentials: "same-origin",
        signal: this.controller.signal,
        cache: "no-store",
      });
    } catch {
      throw transportFailure();
    }
    let value: unknown;
    try {
      if (response.status === 204) {
        value = undefined;
      } else if (
        format === "mcp" &&
        response.headers.get("content-type")?.includes("text/event-stream")
      ) {
        // Legacy stateless MCP returns one JSON-RPC reply in an SSE envelope.
        const text = await response.text();
        const messages: unknown[] = text
          .split(/\r?\n\r?\n/)
          .filter(Boolean)
          .flatMap((event) => {
            const data = event
              .split(/\r?\n/)
              .filter((line) => line.startsWith("data:"))
              .map((line) => line.slice(5).trimStart())
              .join("\n");
            return data ? [JSON.parse(data) as unknown] : [];
          });
        value = messages.find(
          (item) => item && typeof item === "object" && "id" in item && item.id === 1,
        );
        if (!value) {
          throw new Error("Missing reply");
        }
      } else {
        value = await response.json();
      }
    } catch {
      if (version !== this.version) {
        throw new Error("O contexto mudou. A resposta anterior foi descartada.");
      }
      if (format === "mcp" && response.status === 401) {
        throw new ConsoleRequestError(MCP_TOKEN_REFUSED_MESSAGE, "AUTHORIZATION_DENIED", 401);
      }
      throw transportFailure();
    }
    if (version !== this.version) {
      throw new Error("O contexto mudou. A resposta anterior foi descartada.");
    }
    if (!response.ok) {
      const error =
        value && typeof value === "object" && "error" in value
          ? (value as { error?: { code?: string; message?: string; fields?: unknown } }).error
          : undefined;
      if (format === "mcp" && response.status === 401) {
        throw new ConsoleRequestError(
          error?.message ?? MCP_TOKEN_REFUSED_MESSAGE,
          error?.code ?? "AUTHORIZATION_DENIED",
          401,
        );
      }
      throw new ConsoleRequestError(
        error?.message ??
          (response.status === 401
            ? "A autenticação foi recusada. Entre novamente no console ou confira se o token da consulta ainda é válido."
            : `Não foi possível concluir a solicitação (${response.status}).`),
        error?.code ?? "TRANSPORT_ERROR",
        response.status,
        Array.isArray(error?.fields)
          ? error.fields
              .filter(
                (field): field is string =>
                  typeof field === "string" && /^[a-zA-Z][a-zA-Z0-9]{0,63}$/.test(field),
              )
              .slice(0, 32)
          : [],
      );
    }
    return value as T;
  }
}
import type { PublicationPreviewResult } from "../../../src/domain/persona-v2/catalog";
import type { QueryLimits } from "../../../src/domain/persona-v2/execution-limits";
