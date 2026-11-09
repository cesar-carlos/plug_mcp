import { z } from "zod";
import { PLUG_SERVER_STAGES, PLUG_SERVER_PHASE_STAGES } from "../errors/plug-server-stages.js";

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

export const INTERACTION_ERROR_STAGES = [
  "preflight",
  "cache",
  "hub",
  "sanitize",
  "validar_escopo",
  ...PLUG_SERVER_STAGES,
  ...PLUG_SERVER_PHASE_STAGES,
  "protocol",
  "authentication",
  "request",
] as const;

export const TRAINING_REQUEST_CODE = "TRAINING_REQUEST";
export const trainingRequestSchema = z.strictObject({
  sourceSupportId: z
    .uuid()
    .describe(
      "Protocolo original de uma falha já relatada por este token que também revelou uma lacuna editorial.",
    )
    .optional(),
  requestId: z.uuid().describe("UUID estável desta tentativa de encaminhamento.").optional(),
  intent: z.string().trim().min(1).max(400),
  gap: z.enum(["metrica", "relacionamento", "regra", "modelo", "outra"]),
  missing: z.string().trim().min(1).max(500),
  acceptance: z.string().trim().min(1).max(500),
  skillId: z.uuid().optional(),
});

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

export type TrainingGap = z.infer<typeof trainingRequestSchema>["gap"];

export interface StoredInteractionError {
  readonly trainingGap?: TrainingGap;
  readonly sourceReportId?: string;
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
    readonly trainingRequest?: { intent: string; missing: string; acceptance: string };
    readonly textExpired?: true;
    readonly question?: string;
    readonly execution?: StoredInteractionError["execution"];
    readonly error: Omit<StoredInteractionError["error"], "message"> & {
      readonly message?: string;
    };
  })[];
  readonly nextCursor: string | null;
}

export const interactionErrorFilterSchema = z.strictObject({
  kind: z.enum(["training_request", "interaction_error"]).optional(),
  beforeId: z.uuid().optional(),
  supportId: z.uuid().optional(),
  reportId: z.uuid().optional(),
});

export type InteractionErrorFilter = z.infer<typeof interactionErrorFilterSchema>;

export interface InteractionErrorStore {
  findBySupport(personaId: string, tokenId: string, supportId: string): Promise<string | null>;
  countRecent(personaId: string, tokenId: string): Promise<number>;
  findTrainingRequest(
    personaId: string,
    tokenId: string,
    requestId: string,
  ): Promise<string | null>;
  insert(report: StoredInteractionError, requestId?: string): Promise<void>;
  list(personaId: string, filter: InteractionErrorFilter): Promise<InteractionErrorPage>;
}
