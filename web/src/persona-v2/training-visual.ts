/** Editorial hint only. Preserve quoted values/identifiers and never rewrite executable SQL. */
export function duplicateSqlExamples(
  examples: readonly { id: string; dialect: string; sql: string }[],
): [string, string][] {
  const seen = new Map<string, string>(),
    duplicates: [string, string][] = [];
  for (const example of examples) {
    if (!example.sql.trim()) continue;
    const tokens =
      example.sql.match(
        /'(?:''|[^'])*'|"(?:""|[^"])*"|\[(?:\]\]|[^\]])*\]|--[^\r\n]*|\/\*[\s\S]*?\*\/|[a-zA-Z_][a-zA-Z0-9_$]*|\d+(?:\.\d+)?|[^\s]/g,
      ) ?? [];
    const key = JSON.stringify([
      example.dialect,
      tokens.map((t) => (/^[a-zA-Z_]/.test(t) ? t.toLowerCase() : t)),
    ]);
    const previous = seen.get(key);
    if (previous) duplicates.push([previous, example.id]);
    else seen.set(key, example.id);
  }
  return duplicates;
}
