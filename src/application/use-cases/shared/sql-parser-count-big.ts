/** Parser copy only: COUNT_BIG(*) and COUNT_BIG(1) count the same rows.
 * The original SQL (and its bigint result) is never changed for execution.
 * Quoted content/comments are consumed before matching the built-in call.
 */
export const normalizeParserCountBig = (sql: string): string =>
  sql.replace(
    /'(?:''|[^'])*'|"(?:""|[^"])*"|`(?:``|[^`])*`|\[(?:\]\]|[^\]])*\]|--[^\r\n]*|\/\*[\s\S]*?\*\/|\bCOUNT_BIG\s*\(\s*\*\s*\)/gi,
    (token) => (/^COUNT_BIG\s*\(/i.test(token) ? token.replace("*", "1") : token),
  );
