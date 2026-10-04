import type { EscopoSkill } from "../../../domain/entities/escopo.js";
import { paresDoRelacionamento } from "../../../domain/entities/escopo.js";
import { igualdadesCobremRelacionamento } from "../../../domain/entities/relacionamento.js";
import { DomainError } from "../../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../../domain/errors/error-codes.js";
import type { SqlAstSelect } from "./sql-ast.js";

const lower = (value: string): string => value.trim().toLowerCase();

export const assertFanoutSeguro = (ast: SqlAstSelect, escopo: EscopoSkill): void => {
  for (const [table, grain] of Object.entries(escopo.graosConfirmados ?? {})) {
    const columns = escopo.colunasPorTabela[table];
    if (!grain.chaves.length || !columns || grain.chaves.some((c) => !columns.includes(c)))
      throw DomainError.pacote({
        code: ERROR_CODES.AGREGACAO_INSEGURA,
        message: "Grão declarado não corresponde às chaves físicas do pacote.",
        hint: "Confirme o grão novamente; não use GROUP BY como evidência de chave única.",
      });
  }
  for (const child of [...ast.subqueries, ...ast.setBranches]) {
    assertFanoutSeguro(child, escopo);
  }
  const measures = ast.colunas.filter((c) =>
    /\b(SUM|COUNT|AVG|STRING_AGG|LIST)\s*\(/i.test(c.expr),
  );
  if (measures.length > 0 && ast.joins.length > 0) {
    assertMeasureGrain(ast, escopo, measures);
  }
};

interface Edge {
  from: string;
  to: string;
  multiplying: boolean;
}
export const resolvePhysicalJoinKey = (
  table: SqlAstSelect["tabelas"][number] | undefined,
  column: string,
): { table: string; column: string } | null => {
  if (!table) {
    return null;
  }
  if (!table.derived) {
    return { table: table.nome, column };
  }
  const output = table.derived.colunas.find(
    (c) => lower((c.alias.length > 0 ? c.alias : c.column) ?? "") === lower(column),
  );
  const ref = output?.refs.length === 1 && !output.isAggregate ? output.refs[0] : undefined;
  if (!ref) {
    return null;
  }
  const input = ref.table
    ? table.derived.tabelas.find((t) => lower(t.alias ?? t.nome) === lower(ref.table ?? ""))
    : table.derived.tabelas.length === 1
      ? table.derived.tabelas[0]
      : undefined;
  return resolvePhysicalJoinKey(input, ref.column);
};
/** GROUP BY collapses rows only if every grouping expression is equated in this JOIN. */
const uniqueAtJoin = (
  table: SqlAstSelect["tabelas"][number] | undefined,
  columns: readonly string[],
): boolean => {
  const derived = table?.derived;
  if (
    !derived ||
    !derived.temGroupBy ||
    derived.setBranches.length ||
    derived.groupByCount !== derived.groupByRefs.length
  ) {
    return false;
  }
  return derived.groupByRefs.every((key) =>
    derived.colunas.some(
      (output) =>
        !output.isAggregate &&
        output.refs.length === 1 &&
        output.refs[0]?.column === key.column &&
        output.refs[0]?.table === key.table &&
        columns.some(
          (c) => lower(c) === lower((output.alias.length > 0 ? output.alias : output.column) ?? ""),
        ),
    ),
  );
};
const assertMeasureGrain = (
  ast: SqlAstSelect,
  escopo: EscopoSkill,
  measures: readonly SqlAstSelect["colunas"][number][],
): void => {
  const byAlias = new Map(ast.tabelas.map((t) => [lower(t.alias ?? t.nome), t]));
  const edges: Edge[] = [];
  for (const join of ast.joins) {
    const target = lower(join.alias ?? join.tabela);
    const sources = new Set(
      join.equalities
        .flatMap((eq) => [lower(eq.leftAlias), lower(eq.rightAlias)])
        .filter((alias) => alias !== target),
    );
    for (const source of sources) {
      const a = byAlias.get(source),
        b = byAlias.get(target);
      const relevant = join.equalities.filter(
        (eq) =>
          new Set([lower(eq.leftAlias), lower(eq.rightAlias)]).has(source) &&
          new Set([lower(eq.leftAlias), lower(eq.rightAlias)]).has(target),
      );
      const eqs = relevant.flatMap((eq) => {
        const left = resolvePhysicalJoinKey(byAlias.get(lower(eq.leftAlias)), eq.leftColumn),
          right = resolvePhysicalJoinKey(byAlias.get(lower(eq.rightAlias)), eq.rightColumn);
        return left && right
          ? [
              {
                leftTable: left.table,
                leftColumn: left.column,
                rightTable: right.table,
                rightColumn: right.column,
              },
            ]
          : [];
      });
      const rel = escopo.relacionamentos.find((r) =>
        igualdadesCobremRelacionamento(eqs, {
          tabelaOrigem: r.tabelaOrigem,
          tabelaDestino: r.tabelaDestino,
          pares: paresDoRelacionamento(r),
        }),
      );
      const first = relevant[0];
      const originKey = first
        ? resolvePhysicalJoinKey(
            a,
            lower(first.leftAlias) === source ? first.leftColumn : first.rightColumn,
          )
        : null;
      const forward = originKey && rel && lower(originKey.table) === lower(rel.tabelaOrigem);
      const unknown = !a || !b || !rel?.cardinalidade || eqs.length !== relevant.length;
      const card = rel?.cardinalidade;
      const sourceCols = relevant.map((eq) =>
        lower(eq.leftAlias) === source ? eq.leftColumn : eq.rightColumn,
      );
      const targetCols = relevant.map((eq) =>
        lower(eq.leftAlias) === target ? eq.leftColumn : eq.rightColumn,
      );
      edges.push({
        from: source,
        to: target,
        multiplying: Boolean(
          unknown ||
          (!uniqueAtJoin(b, targetCols) &&
            (Boolean(b?.derived) || card === "N:N" || (forward ? card === "1:N" : card === "N:1"))),
        ),
      });
      edges.push({
        from: target,
        to: source,
        multiplying: Boolean(
          unknown ||
          (!uniqueAtJoin(a, sourceCols) &&
            (Boolean(a?.derived) || card === "N:N" || (forward ? card === "N:1" : card === "1:N"))),
        ),
      });
    }
    if (sources.size === 0) {
      throw DomainError.pacote({
        code: ERROR_CODES.AGREGACAO_INSEGURA,
        message: "Não foi possível demonstrar o grão do JOIN agregado.",
        hint: "Use JOINs compostos certificados ou pré-agregação no grão da medida.",
      });
    }
  }
  for (const measure of measures) {
    const origins =
      measure.refs.length === 0
        ? [...byAlias.keys()]
        : measure.refs.map((ref) => {
            if (ref.table) {
              return lower(ref.table);
            }
            const matching = ast.tabelas.filter((t) =>
              (escopo.colunasPorTabela[t.nome] ?? []).some(
                (col) => lower(col) === lower(ref.column),
              ),
            );
            if (matching.length !== 1) {
              throw DomainError.pacote({
                code: ERROR_CODES.COLUNA_AMBIGUA,
                message: "Origem física da medida é ambígua.",
                hint: "Qualifique as colunas da medida.",
              });
            }
            return lower(matching[0]?.alias ?? matching[0]?.nome ?? "");
          });
    for (const origin of new Set(origins)) {
      const pending = [{ node: origin, path: new Set([origin]) }];
      let visitedPaths = 0;
      while (pending.length > 0) {
        if (++visitedPaths > 2048) {
          throw DomainError.pacote({
            code: ERROR_CODES.CONSULTA_ORCAMENTO,
            message: "Grafo de JOINs excede o orçamento de prova de grão.",
            hint: "Reduza os JOINs ou pré-agregue por etapas.",
          });
        }
        const current = pending.pop()!;
        for (const edge of edges.filter(
          (e) => e.from === current.node && !current.path.has(e.to),
        )) {
          if (edge.multiplying) {
            throw DomainError.pacote({
              code: ERROR_CODES.AGREGACAO_INSEGURA,
              message: `A medida ${measure.alias || "agregada"} pode ser multiplicada pelo JOIN.`,
              hint: "Preserve o grão com pré-agregação ou EXISTS. Não corrija com SUM(DISTINCT valor); confirme cardinalidade e origem física no rascunho e republique.",
            });
          }
          pending.push({ node: edge.to, path: new Set([...current.path, edge.to]) });
        }
      }
    }
  }
};
