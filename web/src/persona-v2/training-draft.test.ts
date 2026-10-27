import { describe, expect, it } from "vitest";
import { emptyTraining } from "./model";
import {
  addTrainingColumn,
  addTrainingExample,
  addTrainingParameter,
  addTrainingRelationship,
  addTrainingTable,
  toggleTrainingAttachments,
} from "./training-draft";

describe("mutações do rascunho de consulta", () => {
  it("adiciona tabela, coluna, parâmetro e exemplo sem herdar concessão", () => {
    const training = emptyTraining();
    addTrainingTable(training);
    const table = training.tables[0];
    expect(table).toEqual({ name: "", meaning: "", grain: [] });
    if (!table) {
      return;
    }
    table.name = "pedidos";
    addTrainingColumn(training);
    expect(training.columns[0]).toMatchObject({ table: "pedidos", classification: "livre" });
    addTrainingParameter(training);
    expect(training.parameters[0]).toMatchObject({ type: "string", required: true });
    addTrainingExample(training);
    expect(training.examples?.[0]?.state).toBe("candidate");
  });
  it("gera identificador de relacionamento sem colidir com o existente", () => {
    const training = emptyTraining();
    training.relationships.push({
      id: "relacao_1",
      from: "a",
      to: "b",
      keys: [{ from: "id", to: "id" }],
      join: "inner",
      cardinality: "N:1",
      meaning: "existente",
    });
    addTrainingRelationship(training);
    expect(training.relationships[1]?.id).toBe("relacao_2");
  });
  it("liga e remove anexos JSON com teto inicial explícito", () => {
    const training = emptyTraining();
    toggleTrainingAttachments(training, true);
    expect(training.attachments).toEqual({ format: "json", maxBytes: 1048576, ttlMs: 300000 });
    toggleTrainingAttachments(training, false);
    expect(training.attachments).toBeUndefined();
  });
});
