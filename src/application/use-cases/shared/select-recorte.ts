import type { EscopoSkill } from "../../../domain/entities/escopo.js";
import { paresDoRelacionamento } from "../../../domain/entities/escopo.js";
import { igualdadesCobremRelacionamento } from "../../../domain/entities/relacionamento.js";
import type { SqlAstSelect } from "./sql-ast.js";
import { resolvePhysicalJoinKey } from "./assert-fanout.js";

const lower = (value: string): string => value.trim().toLowerCase();

const directKey = (table: SqlAstSelect["tabelas"][number], column: string): boolean => {
  if (!table.derived) return true;
  const output = table.derived.colunas.find(
    (c) => lower(c.alias.length > 0 ? c.alias : (c.column ?? "")) === lower(column),
  );
  if (!output || output.isExpression || output.isAggregate || !output.column) return false;
  const input = output.table
    ? table.derived.tabelas.find((t) => lower(t.alias ?? t.nome) === lower(output.table!))
    : table.derived.tabelas.length === 1
      ? table.derived.tabelas[0]
      : undefined;
  return !!input && directKey(input, output.column);
};

/** Only the driving FROM contributes a nested restriction; unrelated CTEs never do.
 * Dimension joins must preserve that bounded grain using complete published keys.
 */
export function temRecorteComprovado(ast: SqlAstSelect, scope: EscopoSkill): boolean {
  if (!ast.setBranches.every((branch) => temRecorteComprovado(branch, scope))) return false;
  if (ast.temWhere || ast.temAgregacaoLocal) return true;
  const first = ast.tabelas[0];
  if (
    !first?.derived ||
    !temRecorteComprovado(first.derived, scope) ||
    ast.tabelas.length !== ast.joins.length + 1
  )
    return false;
  const visible = new Map([[lower(first.alias ?? first.nome), first]]);
  for (const join of ast.joins) {
    if (
      !["inner", "inner join", "join", "left", "left join", "left outer join"].includes(
        lower(join.tipoJoin),
      )
    )
      return false;
    const targetAlias = lower(join.alias ?? join.tabela);
    const target = ast.tabelas.find((table) => lower(table.alias ?? table.nome) === targetAlias);
    if (!target || target.derived || visible.has(targetAlias)) return false;
    const preserves = [...visible].some(([sourceAlias, source]) => {
      const relevant = join.equalities.filter(
        (eq) =>
          (lower(eq.leftAlias) === sourceAlias && lower(eq.rightAlias) === targetAlias) ||
          (lower(eq.rightAlias) === sourceAlias && lower(eq.leftAlias) === targetAlias),
      );
      if (!relevant.length) return false;
      const pairs = relevant.map((eq) => {
        const sourceColumn = lower(eq.leftAlias) === sourceAlias ? eq.leftColumn : eq.rightColumn;
        const targetColumn = lower(eq.leftAlias) === targetAlias ? eq.leftColumn : eq.rightColumn;
        const key = directKey(source, sourceColumn)
          ? resolvePhysicalJoinKey(source, sourceColumn)
          : null;
        return key
          ? {
              leftTable: key.table,
              leftColumn: key.column,
              rightTable: target.nome,
              rightColumn: targetColumn,
            }
          : null;
      });
      if (pairs.some((pair) => pair === null)) return false;
      const equalities = pairs.filter((pair) => pair !== null);
      return scope.relacionamentos.some((rel) => {
        // A table-name match cannot distinguish the two directions of a self relationship.
        if (lower(rel.tabelaOrigem) === lower(rel.tabelaDestino)) return false;
        const forward = lower(rel.tabelaDestino) === lower(target.nome);
        const backward = lower(rel.tabelaOrigem) === lower(target.nome);
        return (
          ((forward && ["N:1", "1:1"].includes(rel.cardinalidade ?? "")) ||
            (backward && ["1:N", "1:1"].includes(rel.cardinalidade ?? ""))) &&
          igualdadesCobremRelacionamento(equalities, {
            tabelaOrigem: rel.tabelaOrigem,
            tabelaDestino: rel.tabelaDestino,
            pares: paresDoRelacionamento(rel),
          })
        );
      });
    });
    if (!preserves) return false;
    visible.set(targetAlias, target);
  }
  return true;
}
