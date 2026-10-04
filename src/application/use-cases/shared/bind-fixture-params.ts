/** Fixture runner only: preserve literals, identifiers, comments and PostgreSQL casts. */
export const bindFixtureParams = (
  sql: string,
  params: Readonly<Record<string, unknown>>,
): { sql: string; values: unknown[] } => {
  const values: unknown[] = [];
  const bound = sql.replace(
    /'(?:''|[^'])*'|"(?:""|[^"])*"|--[^\r\n]*|\/\*[\s\S]*?\*\/|(?<!:):(\w+)/g,
    (token, name: string | undefined) => {
      if (!name) return token;
      if (!Object.hasOwn(params, name)) throw new Error("Synthetic parameter missing");
      values.push(params[name]);
      return `$${values.length}`;
    },
  );
  return { sql: bound, values };
};
