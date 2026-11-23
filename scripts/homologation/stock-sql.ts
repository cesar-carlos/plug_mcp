import { scanSql } from "../../src/application/use-cases/shared/sql-scan.js";

/** Fixture-only alias normalization; never rewrite literals or quoted identifiers. */
export function normalizeStockFixtureAliases(sql: string, columns: readonly string[]): string {
  const code = Array<string>(sql.length).fill(" ");
  scanSql(sql, {
    onCode: (character, index) => {
      code[index] = character;
    },
  });
  const aliases = new Set(columns.map((column) => column.toLowerCase()));
  const output = sql.split("");
  for (const match of code.join("").matchAll(/[A-Za-z_][A-Za-z0-9_$]*/g)) {
    if (!aliases.has(match[0].toLowerCase()) || /[:@$]/.test(sql[match.index - 1] ?? "")) continue;
    for (let offset = 0; offset < match[0].length; offset++) {
      output[match.index + offset] = match[0][offset]!.toLowerCase();
    }
  }
  return output.join("");
}
