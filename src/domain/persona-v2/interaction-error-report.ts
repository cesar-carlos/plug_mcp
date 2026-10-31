import { z } from "zod";

/** New reports per token in the last hour. Replays of the same supportId do not count. */
export const INTERACTION_ERROR_REPORTS_PER_HOUR = 20;

export const INTERACTION_ERROR_CATEGORIES = [
  "protocolo",
  "autenticacao",
  "autorizacao",
  "validacao",
  "transporte",
  "consulta",
  "operacao",
  "conhecimento",
  "outro",
] as const;

export const INTERACTION_ERROR_SOURCES = [
  "sql",
  "sql_engine",
  "client_token_rpc",
  "plug_server_http",
  "mcp_preflight",
  "mcp",
  "client_agent_access",
] as const;

export const INTERACTION_ERROR_STAGES = ["preflight", "cache", "hub", "sanitize"] as const;

const codeSchema = z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/);
const toolNameSchema = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/);

const stepSchema = z.strictObject({
  tool: toolNameSchema,
  outcome: z.enum(["sucesso", "erro"]),
  note: z.string().trim().min(1).max(300).optional(),
  code: codeSchema.optional(),
  supportId: z.uuid().optional(),
});

export const interactionErrorExecutionSchema = z.strictObject({
  summary: z.string().trim().min(1).max(4000),
  steps: z.array(stepSchema).max(16),
});

export const interactionErrorReportSchema = z
  .strictObject({
    question: z.string().trim().min(1).max(4000),
    category: z.enum(INTERACTION_ERROR_CATEGORIES),
    categoryDetail: z.string().trim().min(1).max(200).optional(),
    skillId: z.uuid().optional(),
    error: z.strictObject({
      code: codeSchema,
      message: z.string().trim().min(1).max(1000),
      supportId: z.uuid().optional(),
      source: z.enum(INTERACTION_ERROR_SOURCES).optional(),
      stage: z.enum(INTERACTION_ERROR_STAGES).optional(),
      tool: toolNameSchema.optional(),
    }),
    execution: interactionErrorExecutionSchema,
  })
  .superRefine((value, context) => {
    const missing = value.category === "outro" && value.categoryDetail === undefined;
    const unexpected = value.category !== "outro" && value.categoryDetail !== undefined;
    if (missing || unexpected) {
      context.addIssue({
        code: "custom",
        path: ["categoryDetail"],
        message: "categoryDetail",
      });
    }
  });

export type InteractionErrorReportInput = z.infer<typeof interactionErrorReportSchema>;

export interface InteractionErrorReceipt {
  readonly reportId: string;
  readonly trainingChanged: false;
  readonly authorityChanged: false;
  readonly retryAuthorized: false;
}

export interface InteractionErrorStep {
  readonly tool: string;
  readonly outcome: "sucesso" | "erro";
  readonly note?: string;
  readonly code?: string;
  readonly supportId?: string;
}

export interface StoredInteractionError {
  readonly id: string;
  readonly personaId: string;
  readonly tokenId: string;
  readonly question: string;
  readonly category: (typeof INTERACTION_ERROR_CATEGORIES)[number];
  readonly categoryDetail?: string;
  readonly skillId?: string;
  readonly error: InteractionErrorReportInput["error"];
  readonly execution: {
    readonly summary: string;
    readonly steps: readonly InteractionErrorStep[];
  };
  readonly createdAt: string;
}

export interface InteractionErrorPage {
  readonly items: readonly (Omit<StoredInteractionError, "question" | "error" | "execution"> & {
    readonly textExpired?: true;
    readonly question?: string;
    readonly execution?: StoredInteractionError["execution"];
    readonly error: Omit<StoredInteractionError["error"], "message"> & {
      readonly message?: string;
    };
  })[];
  readonly nextCursor: string | null;
}

export interface InteractionErrorStore {
  findBySupport(personaId: string, tokenId: string, supportId: string): Promise<string | null>;
  countRecent(personaId: string, tokenId: string): Promise<number>;
  insert(report: StoredInteractionError): Promise<void>;
  list(personaId: string, beforeId?: string): Promise<InteractionErrorPage>;
}
