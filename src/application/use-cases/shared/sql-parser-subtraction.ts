/**
 * node-sql-parser accepts '-' inside unquoted TransactSQL identifiers and
 * :parameter names. Delimit subtraction only in the parser's copy.
 * Preserve quoted text/identifiers and comments byte-for-byte; never change
 * the SQL used for execution, fingerprints or audit.
 */
export const delimitParserSubtraction = (sql: string): string =>
  sql.replace(
    /'(?:''|[^'])*'|"(?:""|[^"])*"|`(?:``|[^`])*`|\[(?:\]\]|[^\]])*\]|--[^\r\n]*|\/\*[\s\S]*?\*\/|(?<![A-Za-z0-9_])(?:\d+(?:\.\d*)?|\.\d+)[eE][+-]?\d+|-/g,
    (token) => (token === "-" ? " - " : token),
  );
