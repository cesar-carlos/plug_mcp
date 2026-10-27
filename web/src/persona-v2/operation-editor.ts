import type { OperationTraining } from "../../../src/domain/persona-v2/operation-training";
import type { TypedScalar } from "../../../src/domain/persona-v2/operation";
import type { Source } from "./model";
export type { OperationTraining };
export const scalarTypes = ["string", "integer", "decimal", "date", "uuid", "boolean"] as const;
export const names = (value: string): string[] =>
  value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
export const scalar = (type: TypedScalar["type"]): TypedScalar =>
  type === "null"
    ? { type, value: null }
    : type === "boolean"
      ? { type, value: false }
      : { type, value: "" };
/** Rebind the draft to another source. Does not republish or transfer grants. */
export function operationSourceAssignment(
  training: OperationTraining,
  source: Pick<Source, "id" | "dialect"> | undefined,
  nextId: string,
): OperationTraining {
  const next = { ...training, sourceId: nextId };
  if (source && source.dialect !== "firebird") {
    next.dialect = source.dialect;
  }
  delete next.sharedKnowledge;
  return next;
}
export const emptyOperation = (): OperationTraining => ({
  sourceId: "",
  dialect: "mssql",
  purpose: "",
  mode: "somente_parametros",
  approval: "human",
  parameters: [],
  tables: [],
  steps: [],
  maxAffectedRows: 1,
  timeoutMs: 15000,
  rules: [],
  indirectEffects: "",
  reconciliation: "",
});
export const emptyOperationTable = (): OperationTraining["tables"][number] => ({
  name: "",
  meaning: "",
  identity: [],
  concurrency: [],
  columns: [],
});
export const bindingKey = (
  b: OperationTraining["steps"][number]["where"][number]["binding"],
): string =>
  b.kind === "input"
    ? `input:${b.name}`
    : b.kind === "operation_id"
      ? "operation_id"
      : `step:${b.stepId}:${b.output}`;
export function readBinding(
  value: string,
): OperationTraining["steps"][number]["where"][number]["binding"] {
  const [kind, name, output] = value.split(":");
  if (kind === "operation_id") return { kind: "operation_id" };
  if (kind === "input" && name) return { kind: "input", name };
  if (kind === "step" && name && output) return { kind: "step_output", stepId: name, output };
  throw new Error("Selecione um parâmetro ou uma saída de etapa anterior.");
}
