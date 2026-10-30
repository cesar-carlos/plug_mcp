import type { QueryPackage, TrainingCase } from "../../domain/persona-v2/catalog.js";
import { PersonaV2Error } from "../../domain/persona-v2/model.js";
import { parseSelect, type SqlAstSelect } from "../use-cases/shared/sql-ast.js";
import { queryTrainingSchema } from "./query-training.js";

function analytical(ast: SqlAstSelect): boolean {
  return (
    ast.temAgregacao ||
    ast.temGroupBy ||
    ast.joins.length > 0 ||
    ast.tabelas.some((table) => table.derived && analytical(table.derived)) ||
    ast.subqueries.some(analytical) ||
    ast.setBranches.some(analytical)
  );
}

/** Applied only to new previews/publications; existing immutable snapshots are not rewritten. */
export function queryRequiresCases(pkg: QueryPackage): boolean {
  const training = queryTrainingSchema.parse(pkg.training);
  return (
    !!training.semantics?.metrics.length ||
    [training.sqlModel, ...(training.examples ?? []).map((e) => e.sql)].some((sql) =>
      analytical(parseSelect(sql, training.dialect, { allowSchemaQualifiedTables: true })),
    )
  );
}

export function assertQueryCaseCoverage(pkg: QueryPackage, cases: readonly TrainingCase[]): void {
  if (queryRequiresCases(pkg) && !cases.some((item) => item.required)) {
    throw new PersonaV2Error(
      "INCOMPLETE_INPUT",
      "Consultas com agregações, JOIN ou métricas exigem casos obrigatórios e relatório atual do runner isolado.",
    );
  }
}
