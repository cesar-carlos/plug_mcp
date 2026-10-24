import { PersonaV2Error, type Source } from "../../domain/persona-v2/model.js";

const deny = (): never => {
  throw new PersonaV2Error("INVALID_PLAN", "SQL adaptado fora do contrato publicado.");
};

/** Closed token grammar, independent for quoted identifiers of each dialect.
 * No fallback parser, literals, comments, scripts, expressions, joins or subqueries.
 */
function tokens(sql: string, dialect: Source["dialect"]): string[] {
  if (sql.length > 30000) deny();
  const pattern =
    /\s+|"[A-Za-z_][A-Za-z0-9_]*"|\[[a-z_][a-z0-9_]*\]|:[a-z_][a-z0-9_]*|[a-zA-Z_]+|<>|>=|<=|[=><(),.]/gy;
  const result: string[] = [];
  let at = 0;
  while (at < sql.length) {
    pattern.lastIndex = at;
    const match = pattern.exec(sql) ?? deny();
    const value = match[0];
    at = pattern.lastIndex;
    if (/^\s+$/.test(value)) continue;
    if (value.startsWith('"') && !["postgres"].includes(dialect)) deny();
    if (value.startsWith("[") && !["mssql", "sybase"].includes(dialect)) deny();
    result.push(/^[a-zA-Z_]+$/.test(value) ? value.toUpperCase() : value);
  }
  return result;
}
const key = (parts: readonly string[]): string => JSON.stringify(parts);
function split(parts: string[], separator: string): string[][] {
  const result: string[][] = [[]];
  for (const token of parts) {
    if (token === separator) result.push([]);
    else result.at(-1)!.push(token);
  }
  if (result.some((p) => !p.length)) deny();
  return result;
}
function permutation(actual: string[][], required: string[][], optional: string[][] = []) {
  const remaining = new Set(required.map(key));
  const allowed = new Set(optional.map(key));
  const seen = new Set<string>();
  for (const clause of actual) {
    const value = key(clause);
    if (seen.has(value) || (!remaining.delete(value) && !allowed.has(value))) deny();
    seen.add(value);
  }
  if (remaining.size) deny();
}

/** Keeps all mandatory predicates/bindings and exact targets, outputs and values.
 * SET/AND order may change; only published extra AND predicates may be added.
 */
export function adaptOperationSql(
  model: string,
  proposed: string,
  dialect: Source["dialect"],
  optionalPredicates: readonly string[],
): { sql: string; usedParameters: ReadonlySet<string> } {
  const expected = tokens(model, dialect),
    actual = tokens(proposed, dialect);
  const where = expected.indexOf("WHERE"),
    actualWhere = actual.indexOf("WHERE");
  const returning = expected.indexOf("RETURNING");
  const actualReturning = actual.indexOf("RETURNING");
  const prefix = where < 0 ? expected : expected.slice(0, where);
  const actualPrefix = actualWhere < 0 ? actual : actual.slice(0, actualWhere);
  if (expected[0] === "UPDATE") {
    const set = prefix.indexOf("SET"),
      actualSet = actualPrefix.indexOf("SET");
    const output = prefix.indexOf("OUTPUT"),
      actualOutput = actualPrefix.indexOf("OUTPUT");
    if (key(prefix.slice(0, set + 1)) !== key(actualPrefix.slice(0, actualSet + 1))) deny();
    if (output < 0 !== actualOutput < 0) deny();
    if (output >= 0 && key(prefix.slice(output)) !== key(actualPrefix.slice(actualOutput))) deny();
    permutation(
      split(actualPrefix.slice(actualSet + 1, actualOutput < 0 ? undefined : actualOutput), ","),
      split(prefix.slice(set + 1, output < 0 ? undefined : output), ","),
    );
  } else if (key(prefix) !== key(actualPrefix)) deny();
  if (where < 0 !== actualWhere < 0) deny();
  if (returning < 0 !== actualReturning < 0) deny();
  if (returning >= 0 && key(expected.slice(returning)) !== key(actual.slice(actualReturning)))
    deny();
  if (where >= 0) {
    permutation(
      split(
        actual.slice(actualWhere + 1, actualReturning < 0 ? undefined : actualReturning),
        "AND",
      ),
      split(expected.slice(where + 1, returning < 0 ? undefined : returning), "AND"),
      optionalPredicates.map((p) => tokens(p, dialect)),
    );
  }
  return {
    sql: actual.join(" "),
    usedParameters: new Set(actual.filter((t) => t.startsWith(":")).map((t) => t.slice(1))),
  };
}
