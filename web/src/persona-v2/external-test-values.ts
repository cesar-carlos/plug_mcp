import type { ExternalContract } from "../../../src/domain/persona-v2/external-contract";
export interface ExternalTestValue {
  enabled: boolean;
  value: string;
}
export function editExternalValues(
  fields: ExternalContract["input"],
  values: Record<string, string | number | boolean> = {},
): Record<string, ExternalTestValue> {
  return Object.fromEntries(
    Object.entries(fields).map(([key, f]) => [
      key,
      {
        enabled: f.required || Object.hasOwn(values, key),
        value: Object.hasOwn(values, key)
          ? String(values[key])
          : f.type === "boolean"
            ? "false"
            : "",
      },
    ]),
  );
}
export function readExternalValues(
  fields: ExternalContract["input"],
  values: Record<string, ExternalTestValue>,
): Record<string, string | number | boolean> {
  return Object.fromEntries(
    Object.entries(fields)
      .filter(([key, f]) => f.required || values[key]?.enabled)
      .map(([key, f]): [string, string | number | boolean] => {
        const value = values[key]?.value ?? "";
        if (f.type === "string") return [key, value];
        if (f.type === "boolean" && ["true", "false"].includes(value))
          return [key, value === "true"];
        if (
          f.type === "number" &&
          value.trim() &&
          Number.isFinite(Number(value)) &&
          (!Number.isInteger(Number(value)) || Number.isSafeInteger(Number(value)))
        )
          return [key, Number(value)];
        throw new Error(
          `Valor inválido em ${key}. Informe ${f.type === "number" ? "número finito; decimais exatos usam campos de texto" : "verdadeiro ou falso"}.`,
        );
      }),
  );
}
