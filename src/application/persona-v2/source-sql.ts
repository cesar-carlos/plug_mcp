import type { Dialeto } from "../../domain/entities/dialeto.js";
import type { EscopoSkill } from "../../domain/entities/escopo.js";
import { exigirPaginacaoEstavel, validarAstNoEscopo } from "../use-cases/shared/validar-escopo.js";
import { PersonaV2Error } from "../../domain/persona-v2/model.js";
import { paginationFailure } from "../../domain/errors/pagination-diagnostic.js";
import { parseSelect, type SqlAstSelect } from "../use-cases/shared/sql-ast.js";

export const validateSourceSql = (
  sql: string,
  dialect: Dialeto,
  scope: EscopoSkill,
  options?: { page?: number; pageSize?: number },
): SqlAstSelect => {
  if (dialect === "firebird")
    throw new PersonaV2Error("CAPABILITY_UNAVAILABLE", "Firebird não é suportado.");
  const ast = validarAstNoEscopo(
    parseSelect(sql, dialect, { allowSchemaQualifiedTables: true }),
    scope,
  );
  assertSourcePagination(ast, options);
  return ast;
};

export const assertSourcePagination = (
  ast: SqlAstSelect,
  options?: { page?: number; pageSize?: number },
): void => {
  exigirPaginacaoEstavel(ast.sql, ast, options);
  if (options?.page !== undefined) {
    const qualified = ast.orderByRefs.filter((ref) => ref.table);
    const outputs = ast.colunas.map((column) => column.alias.toLowerCase());
    const projected = ast.orderByRefs.every((ref) => {
      if (!ref.table) return outputs.includes(ref.column.toLowerCase());
      const matches = ast.colunas.filter(
        (column) => column.table === ref.table && column.column === ref.column,
      );
      return matches.length === 1 && (ast.cteNomes.length === 0 || matches[0]?.explicitAlias);
    });
    if (
      !ast.simplePaginationOrder ||
      !projected ||
      (qualified.length > 0 &&
        (!ast.simplePaginationProjection || new Set(outputs).size !== outputs.length))
    ) {
      throw paginationFailure(
        !ast.simplePaginationOrder
          ? "order_not_simple"
          : !projected
            ? "order_not_projected"
            : new Set(outputs).size !== outputs.length
              ? "duplicate_projection_alias"
              : "qualified_order_requires_simple_projection",
      );
    }
  }
};
