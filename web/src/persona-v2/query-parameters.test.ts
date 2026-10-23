import { expect, it } from "vitest";
import { queryParameters } from "./query-parameters";
const parameter = (name: string, type: string, required = false) => ({
  name,
  type,
  required,
  meaning: name,
});
it("distingue omitido, nulo e texto vazio sem arredondar decimal nem perder booleano falso", () => {
  expect(
    queryParameters(
      [
        parameter("omitido", "string"),
        parameter("nulo", "string"),
        parameter("vazio", "string"),
        parameter("valor", "decimal", true),
        parameter("ativo", "boolean", true),
      ],
      { valor: "9007199254740993.123456789", ativo: "false" },
      { omitido: "omit", nulo: "null", vazio: "empty" },
    ),
  ).toEqual({ nulo: null, vazio: "", valor: "9007199254740993.123456789", ativo: false });
});
it("não contorna obrigatoriedade por seleção de ausência e recusa booleano inválido", () => {
  expect(() =>
    queryParameters([parameter("obrigatorio", "integer", true)], {}, { obrigatorio: "omit" }),
  ).toThrow("Informe");
  expect(() =>
    queryParameters([parameter("ativo", "boolean")], { ativo: "indefinido" }, {}),
  ).toThrow("Escolha");
});
