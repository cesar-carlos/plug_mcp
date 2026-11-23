import { PersonaV2Error } from "../../domain/persona-v2/model.js";
import { collectGuaranteedEqualities, type SqlAstSelect } from "../use-cases/shared/sql-ast.js";

/** An unknown grain cannot authorize a row source, value projection or JOIN. */
export function assertExistenceOnlyTables(
  ast: SqlAstSelect,
  tables: readonly { name: string; existenceOnly?: true }[],
): void {
  const restricted = new Set(
    tables.filter((t) => t.existenceOnly).map((t) => t.name.toLowerCase()),
  );
  if (!restricted.size) return;
  const refuse = (): never => {
    throw new PersonaV2Error(
      "INVALID_PLAN",
      "Tabela sem grão só permite EXISTS/NOT EXISTS correlacionado no WHERE ou condição de CASE, com SELECT 1 e relacionamento completo. Não use como origem, JOIN, projeção direta, agregação ou paginação interna.",
    );
  };
  const visit = (select: SqlAstSelect, parents: readonly SqlAstSelect[] = []): void => {
    for (const table of select.tabelas) {
      if (!table.isCte && !table.isSubquery && restricted.has(table.nome.toLowerCase())) {
        if (
          !parents.length ||
          !select.predicateExists ||
          select.tabelas.length !== 1 ||
          select.joins.length ||
          select.temAgregacao ||
          select.temGroupBy ||
          select.temHaving ||
          select.temOrderBy ||
          select.temLimite ||
          select.setBranches.length ||
          select.subqueries.length ||
          table.derived
        )
          refuse();
        const local = (table.alias ?? table.nome).toLowerCase();
        const visible = new Map<string, boolean>();
        for (const parent of parents)
          for (const t of parent.tabelas) {
            const alias = (t.alias ?? t.nome).toLowerCase();
            if (!visible.has(alias))
              visible.set(
                alias,
                !t.isCte && !t.isSubquery && !restricted.has(t.nome.toLowerCase()),
              );
          }
        const outer = new Set(
          [...visible].filter(([, allowed]) => allowed).map(([alias]) => alias),
        );
        if (
          outer.has(local) ||
          !collectGuaranteedEqualities(select.whereAst).some(
            (eq) =>
              (eq.leftAlias.toLowerCase() === local && outer.has(eq.rightAlias.toLowerCase())) ||
              (eq.rightAlias.toLowerCase() === local && outer.has(eq.leftAlias.toLowerCase())),
          )
        )
          refuse();
      }
    }
    for (const child of select.subqueries) visit(child, [select, ...parents]);
    for (const branch of select.setBranches) visit(branch, parents);
  };
  visit(ast);
}
