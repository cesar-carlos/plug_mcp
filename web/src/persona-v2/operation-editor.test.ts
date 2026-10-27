import { describe, expect, it } from "vitest";
import {
  bindingKey,
  readBinding,
  scalar,
  emptyOperation,
  operationSourceAssignment,
  type OperationTraining,
} from "./operation-editor";
describe("contrato do editor de operações", () => {
  it("preserva referências de saídas anteriores e identidade sem interpolação SQL", () => {
    for (const binding of [
      { kind: "input", name: "valor" },
      { kind: "step_output", stepId: "inserir", output: "id" },
      { kind: "operation_id" },
    ] as const)
      expect(readBinding(bindingKey(binding))).toEqual(binding);
    expect(() => readBinding("step:inserir")).toThrow();
    expect(() => readBinding("texto")).toThrow();
  });
  it("mantém inteiros e decimais em texto e diferencia vazio, booleano e nulo", () => {
    const decimal = scalar("decimal"),
      integer = scalar("integer");
    expect(decimal).toEqual({ type: "decimal", value: "" });
    expect(integer).toEqual({ type: "integer", value: "" });
    expect(scalar("null")).toEqual({ type: "null", value: null });
    expect(scalar("boolean")).toEqual({ type: "boolean", value: false });
    expect(emptyOperation().approval).toBe("human");
  });
  it("troca de base remove o vínculo compartilhado local e só copia dialeto suportado", () => {
    const training = {
      ...emptyOperation(),
      sourceId: "src-a",
      dialect: "mssql" as const,
      sharedKnowledge: { catalogId: "c" } as OperationTraining["sharedKnowledge"],
    };
    const postgres = operationSourceAssignment(
      training,
      { id: "src-b", dialect: "postgres" },
      "src-b",
    );
    expect(postgres.sourceId).toBe("src-b");
    expect(postgres.dialect).toBe("postgres");
    expect(postgres.sharedKnowledge).toBeUndefined();
    expect(training.sharedKnowledge).toEqual({ catalogId: "c" });
    const firebird = operationSourceAssignment(
      training,
      { id: "src-c", dialect: "firebird" },
      "src-c",
    );
    expect(firebird.sourceId).toBe("src-c");
    expect(firebird.dialect).toBe("mssql");
  });
});
