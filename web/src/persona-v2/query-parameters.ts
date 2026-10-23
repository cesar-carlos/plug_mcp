import type { Training } from "./model";

export type ParameterMode = "value" | "empty" | "null" | "omit";

/** Preserve decimal text; only the server applies the published type contract. */
export function queryParameters(
  contract: Training["parameters"],
  values: Record<string, string>,
  modes: Record<string, ParameterMode>,
): Record<string, string | boolean | null> {
  const result: Record<string, string | boolean | null> = {};
  for (const parameter of contract) {
    const mode = modes[parameter.name] ?? "value";
    if (mode === "omit" && !parameter.required) continue;
    if (mode === "null" && !parameter.required) {
      result[parameter.name] = null;
      continue;
    }
    if (mode === "empty" && parameter.type === "string") {
      result[parameter.name] = "";
      continue;
    }
    const value = values[parameter.name];
    if (!value?.trim()) {
      if (parameter.required) throw new Error(`Informe ${parameter.meaning} (${parameter.name}).`);
      continue;
    }
    if (parameter.type === "boolean" && !["true", "false"].includes(value))
      throw new Error(`Escolha Sim ou Não para ${parameter.meaning}.`);
    result[parameter.name] = parameter.type === "boolean" ? value === "true" : value;
  }
  return result;
}
