import type { QueryPublicationCase } from "../../domain/persona-v2/publication-fixture.js";
import type { Dialeto } from "../../domain/entities/dialeto.js";
import { PersonaV2Error } from "../../domain/persona-v2/model.js";
import { parseSelect, type SqlAstSelect } from "../use-cases/shared/sql-ast.js";

function hasNestedLimit(ast: SqlAstSelect): boolean {
  return [
    ...ast.subqueries,
    ...ast.setBranches,
    ...ast.tabelas.flatMap((t) => (t.derived ? [t.derived] : [])),
  ].some((child) => child.temLimite || hasNestedLimit(child));
}

/** Opt-in belongs only to query test cases, never to consumers or federation inputs. */
export function queryCaseSqlLimit(
  test: QueryPublicationCase,
  sql: string,
  dialect: Dialeto,
): number | undefined {
  const expected = test.expected.completeness;
  if (expected?.mode !== "sql_limit") return undefined;
  const incompatible = () =>
    new PersonaV2Error(
      "INVALID_PLAN",
      "Caso de ranking exige TOP literal exato em SQL Server, ORDER BY, sem PERCENT, WITH TIES, OFFSET ou limites internos.",
    );
  let ast: SqlAstSelect;
  try {
    ast = parseSelect(sql, dialect, { allowSchemaQualifiedTables: true });
  } catch {
    throw incompatible();
  }
  if (
    dialect !== "mssql" ||
    !Number.isSafeInteger(expected.maxRows) ||
    expected.maxRows < 1 ||
    expected.maxRows > 100 ||
    ast.literalTop !== expected.maxRows ||
    !ast.temOrderBy ||
    ast.setOp ||
    ast.setBranches.length ||
    hasNestedLimit(ast) ||
    !test.expected.ordered ||
    test.expected.rows.length > expected.maxRows
  ) {
    throw incompatible();
  }
  return expected.maxRows;
}
