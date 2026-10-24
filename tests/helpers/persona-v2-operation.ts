import { trainingSource } from "./persona-v2-training.js";
import type { OperationTraining } from "../../src/application/persona-v2/operation-training.js";
export const operationTraining = (sourceId = trainingSource.id): OperationTraining => ({
  sourceId,
  dialect: "postgres",
  purpose: "Atualizar valor de pedido sintético por ID e versão.",
  mode: "somente_parametros",
  approval: "human",
  parameters: [
    { name: "id", type: "integer", nullable: false, meaning: "Identidade do pedido" },
    { name: "version", type: "integer", nullable: false, meaning: "Versão lida pelo cliente" },
    { name: "amount", type: "decimal", nullable: false, meaning: "Novo valor em BRL" },
  ],
  tables: [
    {
      name: "orders",
      meaning: "Pedidos sintéticos",
      identity: ["id"],
      concurrency: ["version"],
      columns: [
        { name: "id", type: "integer", writable: false, meaning: "Identificador" },
        { name: "version", type: "integer", writable: false, meaning: "Versão" },
        { name: "amount", type: "decimal", writable: true, meaning: "Valor em BRL" },
      ],
    },
  ],
  steps: [
    {
      id: "change",
      effect: "update",
      table: "orders",
      values: [{ column: "amount", binding: { kind: "input", name: "amount" } }],
      where: [
        { column: "id", binding: { kind: "input", name: "id" } },
        { column: "version", binding: { kind: "input", name: "version" } },
      ],
      outputs: [],
      rows: { min: 1, max: 1 },
    },
  ],
  maxAffectedRows: 1,
  timeoutMs: 15000,
  rules: ["Não alterar pedido com versão divergente."],
  indirectEffects: "Fixture sem triggers ou cascatas.",
  reconciliation:
    "Consultar pedido por ID e versão; ausência de prova conserva resultado desconhecido.",
});
export const operationInput = {
  id: { type: "integer", value: "1" },
  version: { type: "integer", value: "2" },
  amount: { type: "decimal", value: "42.50" },
} as const;

export const adaptiveOperationTraining = (sourceId = trainingSource.id): OperationTraining => {
  const t = operationTraining(sourceId);
  t.mode = "sql_adaptavel";
  t.parameters.push({
    name: "ceiling",
    type: "decimal",
    nullable: false,
    meaning: "Maior valor atual aceito",
  });
  t.steps[0]!.adaptiveFilters = [{ column: "amount", operator: "<=", parameter: "ceiling" }];
  return t;
};
export const reconciledOperationTraining = (sourceId = trainingSource.id): OperationTraining => {
  const t = operationTraining(sourceId);
  t.tables.push({
    name: "operation_ledger",
    meaning: "Marcador transacional exclusivo",
    identity: ["operation_id"],
    concurrency: [],
    columns: [
      { name: "operation_id", type: "uuid", writable: true, meaning: "ID da preparação MCP" },
    ],
  });
  t.steps.push({
    id: "mark",
    effect: "insert",
    table: "operation_ledger",
    values: [{ column: "operation_id", binding: { kind: "operation_id" } }],
    where: [],
    outputs: [],
    rows: { min: 1, max: 1 },
  });
  t.maxAffectedRows = 2;
  t.reconciliationQuery = {
    table: "operation_ledger",
    operationIdColumn: "operation_id",
    appendOnlyGuarantee: "PK UUID, append-only; nenhum outro escritor altera ou remove marcadores.",
  };
  return t;
};
