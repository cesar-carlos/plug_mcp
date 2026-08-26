/**
 * Scanner SQL que respeita literais, identificadores quoted, comentários e
 * profundidade de parênteses. Usado para params, ORDER BY externo e limites.
 */

const isIdentStart = (ch: string | undefined): boolean => ch !== undefined && /[A-Za-z_]/.test(ch);

const isIdentChar = (ch: string | undefined): boolean =>
  ch !== undefined && /[A-Za-z0-9_]/.test(ch);

const skipQuoted = (sql: string, start: number, quote: string, escapeDoubled: boolean): number => {
  let i = start + 1;
  while (i < sql.length) {
    if (escapeDoubled && sql[i] === quote && sql[i + 1] === quote) {
      i += 2;
      continue;
    }
    if (sql[i] === quote) {
      return i + 1;
    }
    if (quote === "[" && sql[i] === "]") {
      return i + 1;
    }
    i += 1;
  }
  return sql.length;
};

const skipLineComment = (sql: string, start: number): number => {
  let i = start + 2;
  while (i < sql.length && sql[i] !== "\n") {
    i += 1;
  }
  return i;
};

const skipBlockComment = (sql: string, start: number): number => {
  let i = start + 2;
  while (i < sql.length - 1) {
    if (sql[i] === "*" && sql[i + 1] === "/") {
      return i + 2;
    }
    i += 1;
  }
  return sql.length;
};

const skipIdent = (sql: string, start: number): number => {
  let i = start;
  while (isIdentChar(sql[i])) {
    i += 1;
  }
  return i;
};

export interface SqlScanHandlers {
  onCode?: (ch: string, index: number, depth: number) => void;
}

/** Percorre o SQL emitindo caracteres de código no nível informado. */
export const scanSql = (sql: string, handlers: SqlScanHandlers): void => {
  let i = 0;
  let depth = 0;
  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (ch === "'" || ch === '"' || ch === "`") {
      i = skipQuoted(sql, i, ch, true);
      continue;
    }
    if (ch === "[") {
      i = skipQuoted(sql, i, "[", false);
      continue;
    }
    if (ch === "-" && next === "-") {
      i = skipLineComment(sql, i);
      continue;
    }
    if (ch === "/" && next === "*") {
      i = skipBlockComment(sql, i);
      continue;
    }
    if (ch === "(") {
      handlers.onCode?.(ch, i, depth);
      depth += 1;
      i += 1;
      continue;
    }
    if (ch === ")") {
      depth = Math.max(0, depth - 1);
      handlers.onCode?.(ch, i, depth);
      i += 1;
      continue;
    }
    handlers.onCode?.(ch ?? "", i, depth);
    i += 1;
  }
};

/**
 * Cópia do SQL com literais, comentários e conteúdo entre parênteses
 * substituídos por espaços — só o SELECT externo permanece legível.
 */
export const maskSqlTopLevel = (sql: string): string => {
  const out = sql.split("");
  let i = 0;
  let depth = 0;
  const blank = (from: number, to: number): void => {
    for (let k = from; k < to && k < out.length; k += 1) {
      out[k] = out[k] === "\n" ? "\n" : " ";
    }
  };
  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (ch === "'" || ch === '"' || ch === "`") {
      const end = skipQuoted(sql, i, ch, true);
      blank(i, end);
      i = end;
      continue;
    }
    if (ch === "[") {
      const end = skipQuoted(sql, i, "[", false);
      blank(i, end);
      i = end;
      continue;
    }
    if (ch === "-" && next === "-") {
      const end = skipLineComment(sql, i);
      blank(i, end);
      i = end;
      continue;
    }
    if (ch === "/" && next === "*") {
      const end = skipBlockComment(sql, i);
      blank(i, end);
      i = end;
      continue;
    }
    if (ch === "(") {
      depth += 1;
      out[i] = " ";
      i += 1;
      continue;
    }
    if (ch === ")") {
      depth = Math.max(0, depth - 1);
      out[i] = " ";
      i += 1;
      continue;
    }
    if (depth > 0) {
      out[i] = sql[i] === "\n" ? "\n" : " ";
    }
    i += 1;
  }
  return out.join("");
};

export const sqlTemOrderByExterno = (sql: string): boolean =>
  /\bORDER\s+BY\b/i.test(maskSqlTopLevel(sql));

export const sqlDeclaraLimiteExterno = (sql: string): boolean => {
  const masked = maskSqlTopLevel(sql);
  return (
    /\bTOP\s+\d+/i.test(masked) ||
    /\bLIMIT\b/i.test(masked) ||
    /\bOFFSET\b/i.test(masked) ||
    /\bFETCH\s+(FIRST|NEXT)\b/i.test(masked) ||
    /\bSTART\s+AT\b/i.test(masked) ||
    /\bFIRST\s+\d+/i.test(masked)
  );
};

const readIdent = (sql: string, start: number): string => {
  const end = skipIdent(sql, start);
  return sql.slice(start, end);
};

/** Placeholders `:nome` e `@nome` fora de literais, comentários, `::cast` e `@@var`. */
export const extractNamedParams = (sql: string): readonly string[] => {
  const names = new Set<string>();
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (ch === "'" || ch === '"' || ch === "`") {
      i = skipQuoted(sql, i, ch, true);
      continue;
    }
    if (ch === "[") {
      i = skipQuoted(sql, i, "[", false);
      continue;
    }
    if (ch === "-" && next === "-") {
      i = skipLineComment(sql, i);
      continue;
    }
    if (ch === "/" && next === "*") {
      i = skipBlockComment(sql, i);
      continue;
    }
    if (ch === ":" && next === ":") {
      i += 2;
      if (isIdentStart(sql[i])) {
        i = skipIdent(sql, i);
      }
      continue;
    }
    if (ch === "@" && next === "@") {
      i += 2;
      if (isIdentStart(sql[i])) {
        i = skipIdent(sql, i);
      }
      continue;
    }
    if ((ch === ":" || ch === "@") && isIdentStart(next)) {
      const prev = i > 0 ? sql[i - 1] : "";
      if (!isIdentChar(prev)) {
        const nome = readIdent(sql, i + 1);
        if (nome) {
          names.add(nome);
          i += 1 + nome.length;
          continue;
        }
      }
    }
    i += 1;
  }
  return [...names];
};

/** Troca `@nome` → `:nome` só para params conhecidos. Não toca `@@variavel`. */
export const rewriteAtParamsToColon = (sql: string, names: readonly string[]): string => {
  if (names.length === 0) {
    return sql;
  }
  const wanted = new Set(names.map((nome) => nome.toLowerCase()));
  let out = "";
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (ch === "'" || ch === '"' || ch === "`") {
      const end = skipQuoted(sql, i, ch, true);
      out += sql.slice(i, end);
      i = end;
      continue;
    }
    if (ch === "[") {
      const end = skipQuoted(sql, i, "[", false);
      out += sql.slice(i, end);
      i = end;
      continue;
    }
    if (ch === "-" && next === "-") {
      const end = skipLineComment(sql, i);
      out += sql.slice(i, end);
      i = end;
      continue;
    }
    if (ch === "/" && next === "*") {
      const end = skipBlockComment(sql, i);
      out += sql.slice(i, end);
      i = end;
      continue;
    }
    if (ch === "@" && next === "@") {
      const end = isIdentStart(sql[i + 2]) ? skipIdent(sql, i + 2) : i + 2;
      out += sql.slice(i, end);
      i = end;
      continue;
    }
    if (ch === "@" && isIdentStart(next)) {
      const prev = i > 0 ? sql[i - 1] : "";
      if (!isIdentChar(prev)) {
        const nome = readIdent(sql, i + 1);
        if (nome && wanted.has(nome.toLowerCase())) {
          out += `:${nome}`;
          i += 1 + nome.length;
          continue;
        }
      }
    }
    out += ch;
    i += 1;
  }
  return out;
};
