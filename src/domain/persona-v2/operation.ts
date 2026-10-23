import { PREPARATION_TTL_MS, PersonaV2Error, type SqlEffect } from "./model.js";
import { expectedStructureSchema, type ExpectedStructure } from "./source-schema.js";

export type OperationState =
  | "preparada"
  | "aprovacao_pendente"
  | "aprovada"
  | "executando"
  | "concluida"
  | "recusada"
  | "expirada"
  | "rollback_confirmado"
  | "cancelamento_solicitado"
  | "cancelada"
  | "resultado_desconhecido";

export type TypedScalar =
  | { readonly type: "string" | "decimal" | "date" | "uuid"; readonly value: string }
  | { readonly type: "integer"; readonly value: string }
  | { readonly type: "boolean"; readonly value: boolean }
  | { readonly type: "null"; readonly value: null };

export type OperationParameter =
  | { readonly kind: "value"; readonly scalar: TypedScalar }
  | { readonly kind: "step_output"; readonly stepId: string; readonly output: string };

export interface OperationStep {
  readonly id: string;
  readonly effect: SqlEffect;
  readonly sql: string;
  readonly params: Readonly<Record<string, OperationParameter>>;
  readonly affectedRows?: { readonly min: number; readonly max: number };
  readonly expectedRows?: { readonly min: number; readonly max: number };
  readonly outputs: Readonly<Record<string, TypedScalar["type"]>>;
}

export interface SqlOperationCommand {
  readonly expectedStructure?: ExpectedStructure;
  readonly operationId: string;
  readonly fingerprint: string;
  readonly database: string;
  readonly steps: readonly OperationStep[];
  readonly maxAffectedRows: number;
  readonly timeoutMs: number;
}

export interface OperationReceipt {
  readonly operationId: string;
  readonly fingerprint: string;
  readonly state: "concluida" | "rollback_confirmado" | "resultado_desconhecido" | "cancelada";
  readonly executionId: string;
  readonly directlyAffectedRows: number | null;
  readonly completedAt: string;
  readonly failureCode?: OperationFailureCode;
}

/** Categorical journal metadata only; never a native diagnostic or an outcome proof. */
export const OPERATION_FAILURE_CODES = [
  "SOURCE_IDENTITY_MISMATCH",
  "SOURCE_STRUCTURE_MISMATCH",
  "SQL_OPERATION_CONDITION_FAILED",
  "SQL_OPERATION_ROW_LIMIT",
  "SQL_OPERATION_ROW_COUNT_UNKNOWN",
  "SQL_OPERATION_OUTPUT_INVALID",
  "SQL_OPERATION_AUTHORIZATION_CHANGED",
  "SQL_OPERATION_AUTHORIZATION_DENIED",
  "SQL_OPERATION_CANCELLED",
  "SQL_OPERATION_NATIVE_FAILED",
  "SQL_OPERATION_TIMEOUT",
  "SQL_OPERATION_INTERRUPTED",
  "SQL_OPERATION_FAILED",
] as const;
export type OperationFailureCode = (typeof OPERATION_FAILURE_CODES)[number];

/** Business evidence is separate from the agent's commit/rollback receipt. */
export interface OperationReconciliation {
  readonly id: string;
  readonly classification: "aplicacao_verificada" | "inconclusiva";
  readonly observedAt: string;
  readonly publicationId: string;
  readonly sourceId: string;
  readonly operationId: string;
  readonly fingerprint: string;
  readonly queryHash: string;
  readonly complete: boolean;
  readonly rows: number;
}

export interface OperationReconciliationQuery {
  readonly expectedStructure?: ExpectedStructure;
  readonly table: string;
  readonly column: string;
  readonly sql: string;
  readonly params: Readonly<Record<string, TypedScalar>>;
}

export interface PreparedOperation {
  readonly id: string;
  readonly personaId: string;
  readonly tokenId: string;
  readonly publicationId: string;
  readonly fingerprint: string;
  readonly state: OperationState;
  readonly requireHumanApproval: boolean;
  readonly expiresAt: Date;
  readonly version: number;
}

export interface OwnerApproval {
  readonly operationId: string;
  readonly ownerId: string;
  readonly fingerprint: string;
  readonly expiresAt: Date;
}

const transitions: Readonly<Record<OperationState, readonly OperationState[]>> = {
  preparada: ["executando", "expirada", "recusada", "cancelada"],
  aprovacao_pendente: ["aprovada", "expirada", "recusada", "cancelada"],
  aprovada: ["executando", "expirada", "recusada", "cancelada"],
  executando: [
    "cancelada",
    "concluida",
    "rollback_confirmado",
    "resultado_desconhecido",
    "cancelamento_solicitado",
  ],
  cancelamento_solicitado: [
    "concluida",
    "rollback_confirmado",
    "resultado_desconhecido",
    "cancelada",
  ],
  resultado_desconhecido: ["concluida", "rollback_confirmado"],
  concluida: [],
  rollback_confirmado: [],
  recusada: [],
  expirada: [],
  cancelada: [],
};

export const transitionOperation = (
  operation: PreparedOperation,
  next: OperationState,
): PreparedOperation => {
  if (!transitions[operation.state].includes(next)) {
    throw new PersonaV2Error("OPERATION_CONFLICT", "Transição de operação recusada.");
  }
  return { ...operation, state: next, version: operation.version + 1 };
};

export const preparationExpiry = (now: Date): Date => new Date(now.getTime() + PREPARATION_TTL_MS);

export const assertExecutableOperation = (
  operation: PreparedOperation,
  expectedFingerprint: string,
  approval: OwnerApproval | null,
  personaOwnerId: string,
  now: Date,
): void => {
  if (operation.fingerprint !== expectedFingerprint) {
    throw new PersonaV2Error("OPERATION_CONFLICT", "Conteúdo preparado foi alterado.");
  }
  if (!["preparada", "aprovada"].includes(operation.state)) {
    throw new PersonaV2Error("OPERATION_CONFLICT", "Operação não pode ser reenviada.");
  }
  if (operation.expiresAt <= now) {
    throw new PersonaV2Error("OPERATION_EXPIRED", "Prepare novamente a operação expirada.");
  }
  if (
    operation.requireHumanApproval &&
    (operation.state !== "aprovada" ||
      approval?.operationId !== operation.id ||
      approval?.ownerId !== personaOwnerId ||
      approval.fingerprint !== operation.fingerprint ||
      approval.expiresAt <= now ||
      approval.expiresAt > operation.expiresAt)
  ) {
    throw new PersonaV2Error(
      "APPROVAL_REQUIRED",
      "Aprovação vigente do responsável é obrigatória.",
    );
  }
};

/** Structural checks only. SQL AST, publication, recortes and upstream policy remain mandatory. */
export const validateOperationCommand = (command: SqlOperationCommand): void => {
  if (command.expectedStructure) {
    const parsed = expectedStructureSchema.safeParse(command.expectedStructure);
    if (
      !parsed.success ||
      parsed.data.resources.some(
        (r) =>
          r.columns.some((c) => c.nullable === null) ||
          (r.constraints &&
            Object.values(r.constraints).some((keys) => keys.some((k) => k.status !== "enabled"))),
      )
    )
      throw new PersonaV2Error(
        "INVALID_PLAN",
        "Expectativa estrutural de operação não comprovada.",
      );
  }
  if (
    command.steps.length === 0 ||
    command.steps.length > 32 ||
    !/^[a-f0-9]{64}$/.test(command.fingerprint) ||
    !command.database ||
    !Number.isSafeInteger(command.maxAffectedRows) ||
    command.maxAffectedRows < 1 ||
    command.maxAffectedRows > 100_000 ||
    !Number.isSafeInteger(command.timeoutMs) ||
    command.timeoutMs < 1 ||
    command.timeoutMs > 300_000
  ) {
    throw new PersonaV2Error("INVALID_PLAN", "Envelope de operação inválido.");
  }
  const previous = new Map<string, OperationStep>();
  let writes = 0;
  for (const step of command.steps) {
    if (
      !step.id ||
      previous.has(step.id) ||
      !step.sql.trim() ||
      !["select", "insert", "update", "delete"].includes(step.effect)
    ) {
      throw new PersonaV2Error("INVALID_PLAN", "Etapa vazia ou identidade duplicada.");
    }
    if (
      step.expectedRows &&
      (!Number.isSafeInteger(step.expectedRows.min) ||
        !Number.isSafeInteger(step.expectedRows.max) ||
        step.expectedRows.min < 0 ||
        step.expectedRows.max < step.expectedRows.min ||
        step.expectedRows.max > 100_000)
    )
      throw new PersonaV2Error("INVALID_PLAN", "Condição de leitura inválida.");
    if (step.effect !== "select") {
      writes += 1;
      if (
        !step.affectedRows ||
        !Number.isSafeInteger(step.affectedRows.min) ||
        !Number.isSafeInteger(step.affectedRows.max) ||
        step.affectedRows.min < 0 ||
        step.affectedRows.max < 1 ||
        step.affectedRows.min > step.affectedRows.max ||
        step.affectedRows.max > command.maxAffectedRows
      ) {
        throw new PersonaV2Error(
          "INVALID_PLAN",
          "Limites de alteração são obrigatórios por etapa.",
        );
      }
    }
    for (const param of Object.values(step.params)) {
      if (param.kind === "step_output") {
        const origin = previous.get(param.stepId);
        if (!origin || !Object.hasOwn(origin.outputs, param.output)) {
          throw new PersonaV2Error("INVALID_PLAN", "Parâmetro referencia saída indisponível.");
        }
      }
    }
    previous.set(step.id, step);
  }
  if (writes === 0) {
    throw new PersonaV2Error("INVALID_PLAN", "Lançamento precisa conter ao menos uma alteração.");
  }
};

export const upstreamPermissionFor = (effect: SqlEffect): "read" | "update" | "delete" =>
  effect === "select" ? "read" : effect === "delete" ? "delete" : "update";

/** Mirrors fixed metadata/count statements on the agent's executing connection. */
export const operationStatementCount = (command: SqlOperationCommand, dialect: string): number =>
  1 +
  command.steps.reduce(
    (count, step) =>
      count + (step.effect !== "select" && ["mssql", "sybase"].includes(dialect) ? 2 : 1),
    0,
  ) +
  (command.expectedStructure
    ? 1 +
      command.expectedStructure.resources.reduce(
        (count, r) =>
          count + 2 + Object.values(r.constraints ?? {}).filter((keys) => keys.length > 0).length,
        0,
      )
    : 0);
