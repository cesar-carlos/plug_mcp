import { canonicalJson } from "../../domain/persona-v2/catalog.js";
import type { TypedScalar } from "../../domain/persona-v2/operation.js";
import { PersonaV2Error } from "../../domain/persona-v2/model.js";

/** Compare exact values without coercing decimal/bigint through a JS number. */
export function caseValue(value: unknown, type: string): unknown {
  if (value === null) return null;
  if (type === "string") {
    if (typeof value === "string") return value;
  } else if (type === "integer") {
    if (typeof value === "number" && !Number.isSafeInteger(value))
      throw new Error("Inteiro inexato na fixture.");
    if (
      (typeof value === "string" || typeof value === "number" || typeof value === "bigint") &&
      /^-?\d+$/.test(String(value))
    )
      return BigInt(String(value)).toString();
  } else if (type === "decimal") {
    if (typeof value === "number" && !Number.isSafeInteger(value))
      throw new Error("Decimal nativo deve conservar representação exata.");
    if (typeof value === "string" || typeof value === "number") {
      // SQL Anywhere VARCHAR casts may omit the zero before the decimal point.
      const match = /^(-?)(?:(\d+)(?:\.(\d+))?|\.(\d+))$/.exec(String(value));
      if (match) {
        const whole = BigInt(match[2] ?? "0").toString();
        const fraction = (match[3] ?? match[4] ?? "").replace(/0+$/, "");
        return `${whole === "0" && !fraction ? "" : match[1]}${whole}${fraction ? `.${fraction}` : ""}`;
      }
    }
  } else if (type === "boolean") {
    if (value === true || value === 1 || value === "1") return true;
    if (value === false || value === 0 || value === "0") return false;
  } else if (type === "uuid") {
    if (typeof value === "string" && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value))
      return value.toLowerCase();
  } else if (type === "date") {
    const date = value instanceof Date ? value.toISOString() : value;
    if (typeof date === "string" && /^\d{4}-\d{2}-\d{2}(?:(?:T| )00:00:00(?:\.0+)?Z?)?$/.test(date))
      return date.slice(0, 10);
  }
  throw new PersonaV2Error(
    "INVALID_PLAN",
    `Valor de fixture incompatível com ${type} (${typeof value}); não há conversão aproximada.`,
  );
}

export function caseRowsEqual(
  actual: readonly Record<string, unknown>[],
  expected: readonly Record<string, TypedScalar>[],
  columns: readonly { name: string; type: string }[],
  ordered: boolean,
): boolean {
  const names = columns.map((c) => c.name);
  if (
    actual.length !== expected.length ||
    [...actual, ...expected].some(
      (r) => Object.keys(r).length !== names.length || names.some((n) => !(n in r)),
    )
  )
    return false;
  const normalize = (rows: readonly Record<string, unknown>[]) =>
    rows.map((row) => canonicalJson(columns.map((c) => caseValue(row[c.name], c.type))));
  const left = normalize(actual);
  const right = normalize(
    expected.map((row) =>
      Object.fromEntries(Object.entries(row).map(([key, scalar]) => [key, scalar.value])),
    ),
  );
  if (!ordered) {
    left.sort();
    right.sort();
  }
  return canonicalJson(left) === canonicalJson(right);
}
