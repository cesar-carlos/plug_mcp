import type { Dialeto } from "../../domain/entities/dialeto.js";
import type { EscopoSkill } from "../../domain/entities/escopo.js";
import { exigirPaginacaoEstavel, validarAstNoEscopo } from "../use-cases/shared/validar-escopo.js";
import { PersonaV2Error } from "../../domain/persona-v2/model.js";
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
    const projected = ast.orderByRefs.every((ref) =>
      ref.table
        ? ast.colunas.filter((column) => column.table === ref.table && column.column === ref.column)
            .length === 1
        : ast.colunas.some((column) => column.alias.toLowerCase() === ref.column.toLowerCase()),
    );
    if (
      !ast.simplePaginationOrder ||
      !projected ||
      (qualified.length > 0 && !ast.simplePaginationProjection)
    ) {
      throw new PersonaV2Error(
        "INVALID_PLAN",
        "Paginação exige ORDER BY com nomes ou aliases simples da projeção. Use um alias projetado sem prefixo de tabela, expressão, posição numérica ou NULLS FIRST/LAST; mantenha options.page e options.pageSize, sem limite SQL. A consulta não foi enviada; revise explicitamente o SQL, sem repetição automática.",
      );
    }
  }
};
