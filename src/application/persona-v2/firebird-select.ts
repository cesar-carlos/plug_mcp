import { DomainError } from "../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../domain/errors/error-codes.js";
import {
  collectGuaranteedEqualities,
  type SqlAstSelect,
  type SqlAstColumnRef,
} from "../use-cases/shared/sql-ast.js";

interface Token {
  kind: "word" | "quoted" | "string" | "number" | "param" | "symbol";
  value: string;
  start: number;
  end: number;
}
interface Expr {
  type: string;
  [key: string]: unknown;
}
const aggregates = new Set(["COUNT", "SUM", "AVG", "MIN", "MAX", "LIST"]);
const functions = new Set([
  ...aggregates,
  "COALESCE",
  "NULLIF",
  "ABS",
  "ROUND",
  "FLOOR",
  "CEILING",
  "MOD",
  "CHAR_LENGTH",
  "UPPER",
  "LOWER",
  "TRIM",
  "REPLACE",
  "IIF",
]);
const clauses = new Set(
  "FROM WHERE GROUP HAVING ORDER ROWS INNER LEFT JOIN ON ASC DESC NULLS FIRST LAST SKIP TO".split(
    " ",
  ),
);
const reserved = new Set([
  ...clauses,
  ..."SELECT DISTINCT AS AND OR NOT IS NULL IN LIKE CONTAINING STARTING WITH TRUE FALSE CAST".split(
    " ",
  ),
]);
const deny = (): never => {
  throw DomainError.pacote({
    code: ERROR_CODES.INVALID_SQL,
    message: "SQL fora da gramática SELECT Firebird suportada.",
    hint: "Consulte docs/persona-v2/firebird-sql.md; não há fallback para T-SQL.",
  });
};

function tokenize(sql: string): Token[] {
  if (Buffer.byteLength(sql, "utf8") > 30000) deny();
  const result: Token[] = [];
  const pattern =
    /\s+|"(?:""|[^"])*"|'(?:''|[^'])*'|:[a-z_][a-z0-9_$]*|[a-zA-Z_][a-zA-Z0-9_$]*|\d+(?:\.\d+)?|<>|!=|<=|>=|\|\||[(),.*+\-/=<>]/y;
  let position = 0,
    depth = 0;
  while (position < sql.length) {
    pattern.lastIndex = position;
    const match = pattern.exec(sql);
    if (!match) return deny();
    const value = match[0];
    const start = position;
    position = pattern.lastIndex;
    if (/^\s/.test(value)) continue;
    if (value === "(" && ++depth > 32) deny();
    if (value === ")" && --depth < 0) deny();
    if (
      result.length >= 4000 ||
      value.includes("\\") ||
      (value === "-" && sql[position] === "-") ||
      (value === "/" && sql[position] === "*")
    )
      deny();
    const kind = value.startsWith('"')
      ? "quoted"
      : value.startsWith("'")
        ? "string"
        : value.startsWith(":")
          ? "param"
          : /^\d/.test(value)
            ? "number"
            : /^[a-z_]/i.test(value)
              ? "word"
              : "symbol";
    result.push({ kind, value, start, end: position });
  }
  if (depth !== 0) deny();
  return result;
}

function nodes(expr: unknown): Expr[] {
  const result: Expr[] = [];
  const pending: { value: unknown; depth: number }[] = [{ value: expr, depth: 0 }];
  while (pending.length) {
    const { value, depth } = pending.pop()!;
    if (!value || typeof value !== "object") continue;
    if (depth > 32 || result.length >= 4000) deny();
    if (Array.isArray(value)) {
      pending.push(...value.map((v: unknown) => ({ value: v, depth })));
      continue;
    }
    const record = value as Expr;
    result.push(record);
    for (const child of Object.values(record))
      if (child && typeof child === "object") pending.push({ value: child, depth: depth + 1 });
  }
  return result;
}
const refs = (expr: unknown): SqlAstColumnRef[] =>
  nodes(expr)
    .filter((n) => n.type === "column_ref")
    .map((n) => ({ table: n.table as string | null, column: n.column as string }));
const hasAggregate = (expr: unknown): boolean => nodes(expr).some((n) => n.type === "aggregate");

/** Dedicated, bounded Firebird parser. It never rewrites executable SQL. */
export function parseFirebirdSelect(sql: string): SqlAstSelect {
  const tokens = tokenize(sql);
  let index = 0;
  const peek = () => tokens[index]?.value.toUpperCase();
  const take = (value: string): boolean => {
    if (peek() !== value) return false;
    index++;
    return true;
  };
  const expect = (value: string) => {
    if (!take(value)) deny();
  };
  const identifier = (alias = false): string => {
    const token = tokens[index++];
    if (!token || !["word", "quoted"].includes(token.kind)) return deny();
    const value = token.kind === "quoted" ? token.value.slice(1, -1) : token.value;
    if (
      !/^[a-z_][a-z0-9_$]*$/i.test(value) ||
      (token.kind === "word" && !/^[a-z]/i.test(value)) ||
      (token.kind === "word" && reserved.has(value.toUpperCase()))
    )
      return deny();
    // Physical quoted names are case-sensitive in Firebird. The shared authority
    // uses case-folded names, so only canonical uppercase physical quotes are safe.
    if (!alias && token.kind === "quoted" && value !== value.toUpperCase()) deny();
    return value.toLowerCase();
  };
  const text = (start: number) => sql.slice(tokens[start]!.start, tokens[index - 1]!.end);
  const binary = (operator: string, left: Expr, right: Expr): Expr => ({
    type: "binary_expr",
    operator,
    left,
    right,
  });
  const precedence: Record<string, number> = {
    OR: 1,
    AND: 2,
    "=": 3,
    "<>": 3,
    "!=": 3,
    "<": 3,
    ">": 3,
    "<=": 3,
    ">=": 3,
    LIKE: 3,
    CONTAINING: 3,
    STARTING: 3,
    IS: 3,
    IN: 3,
    "||": 4,
    "+": 5,
    "-": 5,
    "*": 6,
    "/": 6,
  };
  let recursiveDepth = 0;
  const expression = (minimum = 1): Expr => {
    if (++recursiveDepth > 32) deny();
    const token = tokens[index];
    if (!token) return deny();
    let left: Expr;
    if (take("(")) {
      left = expression();
      expect(")");
    } else if (take("NOT")) left = { type: "unary_expr", operator: "NOT", expr: expression(3) };
    else if (take("-") || take("+"))
      left = { type: "unary_expr", operator: token.value, expr: expression(7) };
    else if (token.kind === "param") {
      index++;
      left = { type: "param", value: token.value.slice(1) };
    } else if (token.kind === "number" || token.kind === "string") {
      index++;
      left = { type: token.kind, value: token.value };
    } else if (["NULL", "TRUE", "FALSE"].includes(peek() ?? "")) {
      index++;
      left = { type: "literal", value: token.value.toUpperCase() };
    } else if (take("CAST")) {
      expect("(");
      const expr = expression();
      expect("AS");
      const type = tokens[index++];
      if (
        type?.kind !== "word" ||
        ![
          "INTEGER",
          "BIGINT",
          "SMALLINT",
          "DECIMAL",
          "NUMERIC",
          "VARCHAR",
          "CHAR",
          "DATE",
          "TIMESTAMP",
          "DOUBLE",
          "FLOAT",
        ].includes(type.value.toUpperCase())
      )
        deny();
      if (take("(")) {
        if (tokens[index++]?.kind !== "number") deny();
        if (take(",") && tokens[index++]?.kind !== "number") deny();
        expect(")");
      }
      expect(")");
      left = { type: "function", name: "CAST", expr };
    } else if (token.kind === "word" && tokens[index + 1]?.value === "(") {
      const name = token.value.toUpperCase();
      if (!functions.has(name)) deny();
      index += 2;
      const distinct = take("DISTINCT");
      const args: Expr[] = [];
      if (take("*")) {
        if (name !== "COUNT" || distinct) deny();
        args.push({ type: "star" });
      } else {
        do {
          args.push(expression());
        } while (take(","));
      }
      expect(")");
      left = { type: aggregates.has(name) ? "aggregate" : "function", name, args, distinct };
    } else {
      const first = identifier();
      left = take(".")
        ? { type: "column_ref", table: first, column: identifier() }
        : { type: "column_ref", table: null, column: first };
    }
    while ((precedence[peek() ?? ""] ?? 0) >= minimum) {
      const operator = peek()!;
      index++;
      if (operator === "IS") {
        const not = take("NOT");
        expect("NULL");
        left = { type: "unary_expr", operator: not ? "IS NOT NULL" : "IS NULL", expr: left };
      } else if (operator === "IN") {
        expect("(");
        const values: Expr[] = [];
        do {
          values.push(expression(4));
        } while (take(","));
        expect(")");
        left = { type: "in", left, values };
      } else {
        if (operator === "STARTING") expect("WITH");
        left = binary(operator, left, expression(precedence[operator]! + 1));
      }
    }
    recursiveDepth--;
    return left;
  };
  expect("SELECT");
  let limited = false;
  const limitValue = () => {
    const token = tokens[index++];
    if (token?.kind !== "number" || !/^\d+$/.test(token.value) || Number(token.value) > 1000000)
      deny();
  };
  if (take("FIRST")) {
    limited = true;
    limitValue();
  }
  if (take("SKIP")) {
    limited = true;
    limitValue();
  }
  take("DISTINCT");
  const columns: SqlAstSelect["colunas"][number][] = [];
  const projections: Expr[] = [];
  do {
    const start = index,
      expr = expression(),
      source = text(start);
    const alias = take("AS")
      ? identifier(true)
      : tokens[index]?.kind === "quoted" ||
          (tokens[index]?.kind === "word" && !reserved.has(peek()!))
        ? identifier(true)
        : expr.type === "column_ref"
          ? String(expr.column)
          : "";
    projections.push(expr);
    columns.push({
      refs: refs(expr),
      expr: source,
      alias,
      table: expr.type === "column_ref" ? (expr.table as string | null) : null,
      column: expr.type === "column_ref" ? String(expr.column) : null,
      isStar: false,
      isExpression: expr.type !== "column_ref",
      isAggregate: hasAggregate(expr),
    });
  } while (take(","));
  expect("FROM");
  const tables: SqlAstSelect["tabelas"][number][] = [];
  const table = () => {
    const nome = identifier();
    const alias = take("AS")
      ? identifier()
      : tokens[index]?.kind === "quoted" ||
          (tokens[index]?.kind === "word" && !reserved.has(peek()!))
        ? identifier()
        : null;
    const result = { nome, alias, isCte: false, isSubquery: false };
    tables.push(result);
    return result;
  };
  table();
  const joins: SqlAstSelect["joins"][number][] = [];
  const joinExpressions: Expr[] = [];
  while (["INNER", "LEFT", "JOIN"].includes(peek() ?? "")) {
    const left = take("LEFT");
    if (left) take("OUTER");
    else take("INNER");
    expect("JOIN");
    const target = table();
    expect("ON");
    const start = index,
      on = expression();
    nodes(on); // Bound structural depth before the common equality walker.
    joinExpressions.push(on);
    joins.push({
      tipoJoin: left ? "left" : "inner",
      tabela: target.nome,
      alias: target.alias,
      on: text(start),
      equalities: collectGuaranteedEqualities(on),
    });
  }
  const where = take("WHERE") ? expression() : null;
  const groups: Expr[] = [];
  if (take("GROUP")) {
    expect("BY");
    do {
      groups.push(expression());
    } while (take(","));
  }
  const having = take("HAVING") ? expression() : null;
  const orders: Expr[] = [];
  if (take("ORDER")) {
    expect("BY");
    do {
      const expr = expression();
      orders.push(
        expr.type === "column_ref" && !expr.table
          ? (projections[columns.findIndex((c) => c.alias === expr.column)] ?? expr)
          : expr,
      );
      if (!take("ASC")) take("DESC");
      if (take("NULLS") && !take("FIRST") && !take("LAST")) deny();
    } while (take(","));
  }
  if (take("ROWS")) {
    if (limited) deny();
    limited = true;
    limitValue();
    if (take("TO")) limitValue();
  }
  if (
    index !== tokens.length ||
    !columns.length ||
    new Set(tables.map((t) => t.alias ?? t.nome)).size !== tables.length
  )
    deny();
  // JOIN/filter/group/order references all participate in the same physical allowlist.
  const filters = [where, having, ...joinExpressions];
  const aggregate = projections.some(hasAggregate) || hasAggregate(having);
  return {
    sql,
    database: "firebird",
    whereAst: where,
    tabelas: tables,
    colunas: columns,
    joins,
    temWhere: where !== null,
    temHaving: having !== null,
    temAgregacao: aggregate,
    temAgregacaoLocal: aggregate,
    temGroupBy: groups.length > 0,
    temOrderBy: orders.length > 0,
    temLimite: limited,
    temStar: false,
    temLiteralTextoFiltro: filters.some((f) => nodes(f).some((n) => n.type === "string")),
    groupByCount: groups.length,
    groupByRefs: groups.flatMap(refs),
    filtroRefs: [...filters, ...groups, ...projections].flatMap(refs),
    orderByRefs: orders.flatMap(refs),
    subqueries: [],
    setBranches: [],
    setOp: null,
    cteNomes: [],
  };
}
