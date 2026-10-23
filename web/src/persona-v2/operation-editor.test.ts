import { describe, expect, it } from "vitest";
import { bindingKey, readBinding, scalar, emptyOperation } from "./operation-editor";
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
});
