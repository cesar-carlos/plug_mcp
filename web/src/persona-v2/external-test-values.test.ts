import { it, expect } from "vitest";
import { editExternalValues, readExternalValues } from "./external-test-values";
const field = (type: "string" | "number" | "boolean", required = true) => ({
  type,
  required,
  purpose: "Teste",
  classification: "livre" as const,
});
it("mantém texto vazio, falso e decimal exato textual; distingue opcional omitido", () => {
  const fields = {
    id: field("string"),
    amount: field("string"),
    active: field("boolean"),
    optional: field("string", false),
  };
  const data = { id: "", amount: "9007199254740993.123456789", active: false };
  expect(readExternalValues(fields, editExternalValues(fields, data))).toEqual(data);
});
it("não transforma número vazio ou inteiro inseguro em valor válido", () => {
  const fields = { n: field("number") };
  for (const value of ["", " ", "NaN", "Infinity", "9007199254740993"])
    expect(() => readExternalValues(fields, { n: { enabled: true, value } })).toThrow();
  expect(readExternalValues(fields, { n: { enabled: true, value: "0" } })).toEqual({ n: 0 });
});
