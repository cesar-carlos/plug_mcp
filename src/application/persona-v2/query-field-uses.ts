import type { SqlAstSelect, SqlAstColumnRef, SqlAstColuna } from "../use-cases/shared/sql-ast.js";
import {
  allowedFieldUses,
  type FieldPolicy,
  type FieldUse,
} from "../../domain/persona-v2/field-use.js";
import { PersonaV2Error } from "../../domain/persona-v2/model.js";

/** Resolves physical lineage before checking a purpose. Aliases never grant authority. */
export function assertQueryFieldUses(
  ast: SqlAstSelect,
  fields: readonly FieldPolicy[],
  outputUses: Readonly<Record<string, readonly FieldUse[]>> = {},
): void {
  if (!fields.some((field) => field.uses !== undefined)) return;
  const policies = new Map(fields.map((field) => [`${field.table}.${field.name}`, field]));
  const refuse = (): never => {
    throw new PersonaV2Error(
      "AUTHORIZATION_DENIED",
      "Campo ou finalidade de uso não concedidos no pacote publicado.",
    );
  };
  const lineage = (
    column: SqlAstColuna,
    select: SqlAstSelect,
    parents: readonly SqlAstSelect[],
    depth: number,
  ): FieldPolicy[] => {
    if (depth > 64) return refuse();
    // A scalar subquery without local refs cannot be safely attributed to a single output.
    if (!column.refs.length && select.subqueries.length) return refuse();
    return column.refs.flatMap((ref) => resolve(ref, select, parents, false, depth + 1));
  };
  const resolve = (
    ref: SqlAstColumnRef,
    select: SqlAstSelect,
    parents: readonly SqlAstSelect[],
    outputAlias: boolean,
    depth: number,
  ): FieldPolicy[] => {
    if (depth > 64) return refuse();
    if (!ref.table && outputAlias) {
      const columns = select.colunas.filter(
        (c) => c.alias.toLowerCase() === ref.column.toLowerCase(),
      );
      if (columns.length === 1) return lineage(columns[0]!, select, parents, depth + 1);
    }
    const candidates = select.tabelas.filter((table) => {
      if (
        ref.table &&
        ref.table.toLowerCase() !== (table.alias ?? table.nome).toLowerCase() &&
        ref.table.toLowerCase() !== table.nome.toLowerCase()
      )
        return false;
      return table.derived
        ? table.derived.colunas.some((c) => c.alias.toLowerCase() === ref.column.toLowerCase())
        : policies.has(`${table.nome}.${ref.column.toLowerCase()}`);
    });
    if (!candidates.length && parents.length)
      return resolve(ref, parents[0]!, parents.slice(1), false, depth + 1);
    if (candidates.length !== 1) return refuse();
    const table = candidates[0]!;
    if (!table.derived)
      return [policies.get(`${table.nome}.${ref.column.toLowerCase()}`) ?? refuse()];
    const index = table.derived.colunas.findIndex(
      (c) => c.alias.toLowerCase() === ref.column.toLowerCase(),
    );
    const unionBranches = (select: SqlAstSelect): SqlAstSelect[] => [
      select,
      ...select.setBranches.flatMap(unionBranches),
    ];
    const branches = unionBranches(table.derived);
    return branches.flatMap((branch) =>
      lineage(branch.colunas[index] ?? refuse(), branch, [select, ...parents], depth + 1),
    );
  };
  const visit = (select: SqlAstSelect, parents: readonly SqlAstSelect[]): void => {
    if (!select.usageRefs || select.unresolvedFieldUses) return refuse();
    for (const [use, refs] of Object.entries(select.usageRefs)) {
      for (const ref of refs) {
        const resolved = resolve(
          ref,
          select,
          parents,
          use === "ordenacao" || use === "agrupamento",
          0,
        );
        for (const field of resolved)
          if (!allowedFieldUses(field).includes(use as FieldUse)) refuse();
      }
    }
    for (const child of select.subqueries) visit(child, [select, ...parents]);
    for (const child of select.setBranches) visit(child, parents);
    for (const table of select.tabelas)
      if (table.derived) visit(table.derived, [select, ...parents]);
    if (select.setBranches.length) {
      const branches = (node: SqlAstSelect): SqlAstSelect[] => [
        node,
        ...node.setBranches.flatMap(branches),
      ];
      const union = branches(select);
      const uses: FieldUse[] = [];
      if (union.some((branch) => branch.temOrderBy)) uses.push("ordenacao");
      if (union.some((branch) => branch.setOp && !branch.setOp.includes("all")))
        uses.push("agrupamento");
      for (const branch of union)
        for (const column of branch.colunas)
          for (const field of lineage(column, branch, parents, 0))
            for (const use of uses) if (!allowedFieldUses(field).includes(use)) refuse();
    }
  };
  visit(ast, []);
  for (const [name, uses] of Object.entries(outputUses)) {
    const index = ast.colunas.findIndex((c) => c.alias.toLowerCase() === name.toLowerCase());
    if (index < 0) refuse();
    const checkBranch = (branch: SqlAstSelect, depth: number): void => {
      if (depth > 64) refuse();
      // Set outputs inherit names from the first SELECT, but every positional
      // branch contributes values, including when it uses a different alias.
      for (const field of lineage(branch.colunas[index] ?? refuse(), branch, [], 0))
        for (const use of uses) if (!allowedFieldUses(field).includes(use)) refuse();
      for (const child of branch.setBranches) checkBranch(child, depth + 1);
    };
    checkBranch(ast, 0);
  }
}
