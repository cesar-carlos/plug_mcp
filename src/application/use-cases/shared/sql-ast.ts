import { createRequire } from "node:module";
import type { Dialeto } from "../../../domain/entities/dialeto.js";
import { DomainError } from "../../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../../domain/errors/error-codes.js";

export interface JoinEqualityAst {
  readonly leftAlias: string;
  readonly leftColumn: string;
  readonly rightAlias: string;
  readonly rightColumn: string;
}

const require = createRequire(import.meta.url);
const { Parser } = require("node-sql-parser") as {
  Parser: new () => {
    astify(sql: string, opt?: { database?: string }): unknown;
    exprToSQL(ast: unknown, opt?: { database?: string }): string;
  };
};

const parser = new Parser();

export type ParserDatabase = "transactsql" | "postgresql";

export const parserDatabaseForDialeto = (dialeto: Dialeto): ParserDatabase => {
  if (dialeto === "postgres") {
    return "postgresql";
  }
  if (dialeto === "firebird") {
    throw DomainError.pacote({
      code: ERROR_CODES.DIALECT_UNSUPPORTED,
      message: "SQL livre não é suportado neste dialeto.",
      hint: "Firebird não tem parser AST. Use só a consulta exemplo (consultar_dados / inspecionar_consulta sem sql). Não reenvie SQL livre neste dialeto.",
    });
  }
  return "transactsql";
};

export interface SqlAstTabela {
  readonly nome: string;
  readonly alias: string | null;
  readonly isCte: boolean;
  readonly isSubquery: boolean;
}

export interface SqlAstColuna {
  readonly expr: string;
  readonly alias: string;
  readonly table: string | null;
  readonly column: string | null;
  readonly isStar: boolean;
  readonly isExpression: boolean;
  readonly isAggregate: boolean;
}

export interface SqlAstJoin {
  readonly tipoJoin: string;
  readonly tabela: string;
  readonly alias: string | null;
  readonly on: string | null;
  readonly equalities: readonly JoinEqualityAst[];
}

export interface SqlAstColumnRef {
  readonly table: string | null;
  readonly column: string;
}

export interface SqlAstSelect {
  readonly sql: string;
  readonly database: ParserDatabase;
  readonly tabelas: readonly SqlAstTabela[];
  readonly colunas: readonly SqlAstColuna[];
  readonly joins: readonly SqlAstJoin[];
  readonly temWhere: boolean;
  readonly temHaving: boolean;
  readonly temAgregacao: boolean;
  readonly temAgregacaoLocal: boolean;
  readonly temGroupBy: boolean;
  readonly temOrderBy: boolean;
  readonly temLimite: boolean;
  readonly temStar: boolean;
  readonly temLiteralTextoFiltro: boolean;
  readonly groupByCount: number;
  readonly groupByRefs: readonly SqlAstColumnRef[];
  readonly filtroRefs: readonly SqlAstColumnRef[];
  readonly orderByRefs: readonly SqlAstColumnRef[];
  readonly subqueries: readonly SqlAstSelect[];
  readonly setBranches: readonly SqlAstSelect[];
  readonly setOp: string | null;
  readonly cteNomes: readonly string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const readString = (value: unknown): string | null => {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  if (isRecord(value) && typeof value.value === "string") {
    return value.value;
  }
  if (isRecord(value) && isRecord(value.expr) && typeof value.expr.value === "string") {
    return value.expr.value;
  }
  return null;
};

const columnName = (value: unknown): string | null => {
  if (typeof value === "string") {
    return value;
  }
  if (isRecord(value)) {
    return readString(value.expr) ?? readString(value.value) ?? readString(value.column);
  }
  return null;
};

const exprToSql = (node: unknown, database: ParserDatabase): string => {
  if (node == null) {
    return "";
  }
  try {
    return parser.exprToSQL(node, { database });
  } catch {
    return "";
  }
};

const collectEqualities = (node: unknown): JoinEqualityAst[] => {
  if (!isRecord(node)) {
    return [];
  }
  if (node.type === "binary_expr" && (node.operator === "AND" || node.operator === "OR")) {
    return [...collectEqualities(node.left), ...collectEqualities(node.right)];
  }
  if (node.type === "binary_expr" && node.operator === "=") {
    const left = isRecord(node.left) ? node.left : null;
    const right = isRecord(node.right) ? node.right : null;
    if (left?.type === "column_ref" && right?.type === "column_ref") {
      const leftAlias = readString(left.table);
      const leftColumn = columnName(left.column);
      const rightAlias = readString(right.table);
      const rightColumn = columnName(right.column);
      if (leftAlias && leftColumn && rightAlias && rightColumn) {
        return [{ leftAlias, leftColumn, rightAlias, rightColumn }];
      }
    }
  }
  return [];
};

const walkNodes = (node: unknown, visit: (item: Record<string, unknown>) => void): void => {
  if (Array.isArray(node)) {
    for (const item of node) {
      walkNodes(item, visit);
    }
    return;
  }
  if (!isRecord(node)) {
    return;
  }
  visit(node);
  for (const value of Object.values(node)) {
    if (value && typeof value === "object") {
      walkNodes(value, visit);
    }
  }
};

const isSelectNode = (node: Record<string, unknown>): boolean =>
  node.type === "select" || (isRecord(node.ast) && node.ast.type === "select");

/** Walk AST skipping nested SELECT so correlated subquery columns stay on the child. */
const walkNodesSkipNestedSelect = (
  node: unknown,
  visit: (item: Record<string, unknown>) => void,
): void => {
  if (Array.isArray(node)) {
    for (const item of node) {
      walkNodesSkipNestedSelect(item, visit);
    }
    return;
  }
  if (!isRecord(node)) {
    return;
  }
  if (node.type === "select") {
    return;
  }
  visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (key === "ast" && isRecord(value) && value.type === "select") {
      continue;
    }
    if (value && typeof value === "object" && isRecord(value) && isSelectNode(value)) {
      continue;
    }
    if (value && typeof value === "object") {
      walkNodesSkipNestedSelect(value, visit);
    }
  }
};

const STRING_LITERAL_TYPES = new Set(["single_quote_string", "string"]);

const hasStringLiteral = (node: unknown): boolean => {
  let found = false;
  walkNodesSkipNestedSelect(node, (item) => {
    if (typeof item.type === "string" && STRING_LITERAL_TYPES.has(item.type)) {
      found = true;
    }
  });
  return found;
};

const groupByColumns = (ast: Record<string, unknown>): unknown[] => {
  if (Array.isArray(ast.groupby)) {
    return ast.groupby;
  }
  if (isRecord(ast.groupby)) {
    if (Array.isArray(ast.groupby.columns)) {
      return ast.groupby.columns;
    }
    if (Array.isArray(ast.groupby.expr)) {
      return ast.groupby.expr;
    }
  }
  return [];
};

const collectRefsFromNode = (node: unknown): { table: string | null; column: string }[] => {
  const out: { table: string | null; column: string }[] = [];
  walkNodesSkipNestedSelect(node, (item) => {
    if (item.type !== "column_ref") {
      return;
    }
    const column = columnName(item.column);
    if (column && column !== "*") {
      out.push({ table: readString(item.table), column });
    }
  });
  return out;
};

const collectFiltroRefs = (ast: Record<string, unknown>): SqlAstColumnRef[] => [
  ...collectRefsFromNode(ast.columns),
  ...collectRefsFromNode(ast.where),
  ...collectRefsFromNode(ast.having),
  ...collectRefsFromNode(ast.groupby),
  ...collectRefsFromNode(ast.orderby),
];

const collectFromOnNodes = (from: unknown): unknown[] =>
  asArray(from)
    .map((item) => (isRecord(item) ? item.on : null))
    .filter((item) => item != null);

const hasAggr = (node: unknown): boolean => {
  let found = false;
  walkNodes(node, (item) => {
    if (item.type === "aggr_func") {
      found = true;
    }
  });
  return found;
};

/** ROW_NUMBER/LAG (`function`/`window_func`) and SUM() OVER (`aggr_func` + over). */
const hasWindow = (node: unknown): boolean => {
  let found = false;
  walkNodes(node, (item) => {
    if (item.type === "window" || item.type === "window_func" || item.over != null) {
      found = true;
    }
  });
  return found;
};

const hasStar = (node: unknown): boolean => {
  let found = false;
  walkNodes(node, (item) => {
    if (item.type === "column_ref" && columnName(item.column) === "*") {
      found = true;
    }
  });
  return found;
};

const cteName = (item: unknown): string | null => {
  if (!isRecord(item)) {
    return null;
  }
  if (isRecord(item.name)) {
    return readString(item.name.value) ?? readString(item.name);
  }
  return readString(item.name);
};

const cteStmt = (item: unknown): unknown => {
  if (!isRecord(item)) {
    return null;
  }
  if (isRecord(item.stmt) && item.stmt.ast) {
    return item.stmt.ast;
  }
  return item.stmt ?? null;
};

const joinTipo = (join: unknown): string => {
  if (typeof join === "string") {
    return join.toLowerCase();
  }
  if (isRecord(join) && typeof join.type === "string") {
    return join.type.toLowerCase();
  }
  return "inner";
};

interface FromItem {
  table?: unknown;
  as?: unknown;
  join?: unknown;
  on?: unknown;
  expr?: unknown;
}

const parseFromItem = (
  item: unknown,
  database: ParserDatabase,
  cteNomes: ReadonlySet<string>,
): { tabela: SqlAstTabela | null; join: SqlAstJoin | null } => {
  if (!isRecord(item)) {
    return { tabela: null, join: null };
  }
  const from = item as FromItem;
  if (isRecord(from.expr) && from.expr.ast) {
    return {
      tabela: {
        nome: readString(from.as) ?? "_subquery",
        alias: readString(from.as),
        isCte: false,
        isSubquery: true,
      },
      join: from.join
        ? {
            tipoJoin: joinTipo(from.join),
            tabela: readString(from.as) ?? "_subquery",
            alias: readString(from.as),
            on: from.on ? exprToSql(from.on, database) : null,
            equalities: collectEqualities(from.on),
          }
        : null,
    };
  }
  const nome = readString(from.table);
  if (!nome) {
    return { tabela: null, join: null };
  }
  const alias = readString(from.as);
  const tabela: SqlAstTabela = {
    nome,
    alias,
    isCte: cteNomes.has(nome.toLowerCase()),
    isSubquery: false,
  };
  if (!from.join) {
    return { tabela, join: null };
  }
  return {
    tabela,
    join: {
      tipoJoin: joinTipo(from.join),
      tabela: nome,
      alias,
      on: from.on ? exprToSql(from.on, database) : null,
      equalities: collectEqualities(from.on),
    },
  };
};

const parseColumns = (
  columns: unknown,
  database: ParserDatabase,
): { colunas: SqlAstColuna[]; temStar: boolean; temAgregacao: boolean } => {
  const colunas: SqlAstColuna[] = [];
  let temStar = false;
  let temAgregacao = false;
  for (const item of asArray(columns)) {
    if (!isRecord(item)) {
      continue;
    }
    const exprNode = item.expr;
    const star = hasStar(exprNode);
    const aggregate = hasAggr(exprNode) || hasWindow(exprNode);
    const isColumnRef = isRecord(exprNode) && exprNode.type === "column_ref";
    const table = isColumnRef ? readString(exprNode.table) : null;
    const column = isColumnRef ? columnName(exprNode.column) : null;
    const alias = readString(item.as) ?? column ?? "";
    const expr = exprToSql(exprNode, database) || (column ?? "");
    if (star) {
      temStar = true;
    }
    if (aggregate) {
      temAgregacao = true;
    }
    colunas.push({
      expr,
      alias,
      table,
      column,
      isStar: star,
      isExpression: !isColumnRef,
      isAggregate: aggregate,
    });
  }
  return { colunas, temStar, temAgregacao };
};

const pushSelectNode = (out: unknown[], node: Record<string, unknown>): void => {
  if (node.type === "select") {
    out.push(node);
    return;
  }
  if (isRecord(node.ast) && node.ast.type === "select") {
    out.push(node.ast);
  }
};

const collectSelectsIn = (node: unknown, out: unknown[]): void => {
  walkNodes(node, (item) => {
    pushSelectNode(out, item);
  });
};

const collectSubqueryAsts = (select: Record<string, unknown>): unknown[] => {
  const out: unknown[] = [];
  for (const item of asArray(select.with)) {
    const stmt = cteStmt(item);
    if (stmt) {
      out.push(stmt);
    }
  }
  for (const item of asArray(select.from)) {
    if (isRecord(item) && isRecord(item.expr) && item.expr.ast) {
      out.push(item.expr.ast);
    }
  }
  collectSelectsIn(select.where, out);
  collectSelectsIn(select.having, out);
  collectSelectsIn(select.columns, out);
  collectSelectsIn(select.groupby, out);
  collectSelectsIn(select.orderby, out);
  for (const on of collectFromOnNodes(select.from)) {
    collectSelectsIn(on, out);
  }
  return out;
};

const fromSelectAst = (ast: unknown, sql: string, database: ParserDatabase): SqlAstSelect => {
  if (!isRecord(ast) || ast.type !== "select") {
    throw DomainError.pacote({
      code: ERROR_CODES.INVALID_SQL,
      message: "Só SELECT pode treinar o grafo.",
      hint: "Envie um SELECT (CTE WITH ... SELECT também vale). INSERT/UPDATE/DELETE/DDL não são aceitos no treino.",
    });
  }
  const cteNomes = asArray(ast.with)
    .map((item) => cteName(item)?.toLowerCase())
    .filter((nome): nome is string => Boolean(nome));
  const cteSet = new Set(cteNomes);
  const tabelas: SqlAstTabela[] = [];
  const joins: SqlAstJoin[] = [];
  for (const item of asArray(ast.from)) {
    const parsed = parseFromItem(item, database, cteSet);
    if (parsed.tabela && !parsed.tabela.isCte) {
      tabelas.push(parsed.tabela);
    }
    if (parsed.join) {
      joins.push(parsed.join);
    }
  }
  const { colunas, temStar, temAgregacao } = parseColumns(ast.columns, database);
  const subqueries = collectSubqueryAsts(ast).map((sub) => fromSelectAst(sub, sql, database));
  const setOp = typeof ast.set_op === "string" ? ast.set_op.toLowerCase() : null;
  const setBranches =
    isRecord(ast._next) && ast._next.type === "select"
      ? [fromSelectAst(ast._next, sql, database)]
      : [];
  const nestedStar =
    subqueries.some((sub) => sub.temStar) || setBranches.some((sub) => sub.temStar);
  const nestedAggr =
    subqueries.some((sub) => sub.temAgregacao) || setBranches.some((sub) => sub.temAgregacao);
  const groupCols = groupByColumns(ast);
  const filtroRefs = collectFiltroRefs(ast);
  return {
    sql,
    database,
    tabelas,
    colunas,
    joins,
    temWhere: ast.where != null,
    temHaving: ast.having != null,
    temAgregacaoLocal: temAgregacao,
    temAgregacao: temAgregacao || nestedAggr,
    temGroupBy: groupCols.length > 0,
    temOrderBy: ast.orderby != null && asArray(ast.orderby).length > 0,
    temLimite: ast.limit != null || ast.top != null,
    temStar: temStar || nestedStar,
    temLiteralTextoFiltro:
      hasStringLiteral(ast.where) ||
      hasStringLiteral(ast.having) ||
      subqueries.some((sub) => sub.temLiteralTextoFiltro) ||
      setBranches.some((sub) => sub.temLiteralTextoFiltro),
    groupByCount: groupCols.length,
    groupByRefs: collectRefsFromNode(ast.groupby),
    filtroRefs,
    orderByRefs: collectRefsFromNode(ast.orderby),
    subqueries,
    setBranches,
    setOp,
    cteNomes,
  };
};

const tryAstify = (sql: string, database: ParserDatabase): unknown =>
  parser.astify(sql, { database });

export const parseSelect = (sql: string, dialeto: Dialeto): SqlAstSelect => {
  const database = parserDatabaseForDialeto(dialeto);
  let ast: unknown;
  try {
    ast = tryAstify(sql, database);
  } catch (error) {
    const message = error instanceof Error ? error.message : "SQL inválido.";
    const janela = /\bOVER\s*\(/i.test(sql);
    throw DomainError.pacote({
      code: ERROR_CODES.INVALID_SQL,
      message: janela
        ? "Não foi possível interpretar a função de janela (OVER) neste dialeto."
        : "Não foi possível interpretar o SQL neste dialeto.",
      hint: janela
        ? `${message.slice(0, 180)}. Reescreva PARTITION BY / ORDER BY da janela no guia de dialeto do acesso.`
        : `${message.slice(0, 180)}. Ajuste o SQL ao guia de dialeto do acesso.`,
    });
  }
  const statements: unknown[] = Array.isArray(ast) ? ast : [ast];
  if (statements.length !== 1) {
    throw DomainError.pacote({
      code: ERROR_CODES.INVALID_SQL,
      message: "SQL não pode conter um segundo comando.",
      hint: "Envie um único SELECT, sem ponto-e-vírgula no meio.",
    });
  }
  const first = statements[0];
  if (!isRecord(first) || first.type !== "select") {
    throw DomainError.pacote({
      code: ERROR_CODES.INVALID_SQL,
      message: "Só SELECT pode treinar o grafo.",
      hint: "Envie um SELECT (CTE WITH ... SELECT também vale). INSERT/UPDATE/DELETE/DDL não são aceitos no treino.",
    });
  }
  return fromSelectAst(first, sql, database);
};

export const tryParseSelect = (sql: string, dialeto?: Dialeto): SqlAstSelect | null => {
  const order: Dialeto[] = dialeto ? [dialeto] : ["mssql", "postgres"];
  for (const item of order) {
    if (item === "firebird") {
      continue;
    }
    try {
      return parseSelect(sql, item);
    } catch {
      continue;
    }
  }
  return null;
};

export const collectColumnRefs = (select: SqlAstSelect): readonly SqlAstColumnRef[] => {
  const out: SqlAstColumnRef[] = [];
  const visit = (item: SqlAstSelect): void => {
    for (const coluna of item.colunas) {
      if (coluna.column && coluna.column !== "*") {
        out.push({ table: coluna.table, column: coluna.column });
      }
    }
    for (const join of item.joins) {
      for (const eq of join.equalities) {
        out.push({ table: eq.leftAlias, column: eq.leftColumn });
        out.push({ table: eq.rightAlias, column: eq.rightColumn });
      }
    }
    for (const ref of item.filtroRefs) {
      out.push(ref);
    }
    for (const ref of item.orderByRefs) {
      out.push(ref);
    }
    for (const sub of item.subqueries) {
      visit(sub);
    }
    for (const branch of item.setBranches) {
      visit(branch);
    }
  };
  visit(select);
  return out;
};

/** Refs desta cláusula apenas — sem subqueries nem ramos de UNION. */
export const collectColumnRefsLocal = (select: SqlAstSelect): readonly SqlAstColumnRef[] => {
  const out: SqlAstColumnRef[] = [];
  for (const coluna of select.colunas) {
    if (coluna.column && coluna.column !== "*") {
      out.push({ table: coluna.table, column: coluna.column });
    }
  }
  for (const join of select.joins) {
    for (const eq of join.equalities) {
      out.push({ table: eq.leftAlias, column: eq.leftColumn });
      out.push({ table: eq.rightAlias, column: eq.rightColumn });
    }
  }
  for (const ref of select.filtroRefs) {
    out.push(ref);
  }
  for (const ref of select.orderByRefs) {
    out.push(ref);
  }
  return out;
};

export const temOrderByNoSelectExterno = (select: SqlAstSelect): boolean => {
  if (select.temOrderBy) {
    return true;
  }
  let current = select;
  while (current.setBranches[0]) {
    current = current.setBranches[0];
    if (current.temOrderBy) {
      return true;
    }
  }
  return false;
};

export const temLimiteNoSelectExterno = (select: SqlAstSelect): boolean => {
  if (select.temLimite) {
    return true;
  }
  let current = select;
  while (current.setBranches[0]) {
    current = current.setBranches[0];
    if (current.temLimite) {
      return true;
    }
  }
  return false;
};

export const walkSelectTree = (select: SqlAstSelect, visit: (item: SqlAstSelect) => void): void => {
  visit(select);
  for (const sub of select.subqueries) {
    walkSelectTree(sub, visit);
  }
  for (const branch of select.setBranches) {
    walkSelectTree(branch, visit);
  }
};
