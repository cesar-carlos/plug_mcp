import type { Training } from "./model";

export function addTrainingTable(training: Training): void {
  training.tables.push({ name: "", meaning: "", grain: [] });
}

export function addTrainingColumn(training: Training): void {
  training.columns.push({
    table: training.tables[0]?.name ?? "",
    name: "",
    meaning: "",
    classification: "livre",
  });
}

export function addTrainingRelationship(training: Training): void {
  let index = 1;
  while (training.relationships.some((relation) => relation.id === `relacao_${index}`)) {
    index++;
  }
  training.relationships.push({
    id: `relacao_${index}`,
    from: "",
    to: "",
    keys: [{ from: "", to: "" }],
    join: "inner",
    cardinality: "N:1",
    meaning: "",
  });
}

export function addTrainingParameter(training: Training): void {
  training.parameters.push({ name: "", type: "string", required: true, meaning: "" });
}

export function addTrainingExample(training: Training): void {
  training.examples ??= [];
  training.examples.push({
    id: "",
    purpose: "",
    sql: "",
    explanation: "",
    state: "candidate",
  });
}

export function toggleTrainingAttachments(training: Training, enabled: boolean): void {
  if (enabled) {
    training.attachments = { format: "json", maxBytes: 1048576, ttlMs: 300000 };
    return;
  }
  delete training.attachments;
}
