import { inferirSensibilidadeColuna } from "../../../domain/entities/privacidade.js";
import type { Skill } from "../../../domain/entities/skill.js";
import type { Dialeto } from "../../../domain/entities/dialeto.js";
import { pareceSegredoEmTexto } from "../../../domain/entities/parece-segredo.js";
import { astParaCuradoria } from "./sql-ast.js";
export const textoSeguro = (text: string): boolean =>
  !pareceSegredoEmTexto(text) &&
  !/[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/i.test(text);
export const capturaSqlSegura = (
  sql: string,
  dialeto: Dialeto,
  skills: readonly Skill[],
): boolean => {
  try {
    if (!textoSeguro(sql)) return false;
    const tokens = sql.match(/'(?:''|[^'])*'|"(?:""|[^"])*"|--[^\r\n]*|\/\*[\s\S]*?\*\//g) ?? [];
    if (tokens.some((t) => t.startsWith("--") || t.startsWith("/*"))) return false;
    const ast = astParaCuradoria(sql, dialeto);
    const walk = (
      node: unknown,
      parent?: Record<string, unknown>,
      key?: string,
      aliases: Readonly<Record<string, string>> = {},
      structural = "",
    ): boolean => {
      if (Array.isArray(node)) return node.every((n) => walk(n, parent, key, aliases, structural));
      if (!node || typeof node !== "object") return true;
      const rec = node as Record<string, unknown>;
      const local =
        rec.type === "select"
          ? Object.fromEntries(
              (Array.isArray(rec.from) ? rec.from : [])
                .filter(
                  (t): t is Record<string, unknown> =>
                    !!t &&
                    typeof t === "object" &&
                    typeof (t as Record<string, unknown>).table === "string",
                )
                .map((t) => [String(t.as ?? t.table).toLowerCase(), String(t.table).toLowerCase()]),
            )
          : aliases;
      if (["number", "single_quote_string", "string", "bool"].includes(String(rec.type))) {
        const value = rec.value;
        if (parent?.type === "binary_expr") {
          const other = (key === "left" ? parent.right : parent.left) as
            Record<string, unknown> | undefined;
          if (other?.type !== "column_ref") return false;
          const rawColumn = other.column;
          const column =
            typeof rawColumn === "string"
              ? rawColumn.toLowerCase()
              : rawColumn &&
                  typeof rawColumn === "object" &&
                  "expr" in rawColumn &&
                  rawColumn.expr &&
                  typeof rawColumn.expr === "object" &&
                  "value" in rawColumn.expr &&
                  typeof rawColumn.expr.value === "string"
                ? rawColumn.expr.value.toLowerCase()
                : "";
          if (!column) return false;
          if (inferirSensibilidadeColuna(column) !== "livre") return false;
          const tables =
            typeof other.table === "string"
              ? [local[other.table.toLowerCase()]]
              : other.table
                ? []
                : Object.values(local);
          if (tables.length !== 1 || !tables[0]) return false;

          const candidates = skills.flatMap((s) =>
            (s.escopo.constantesNegocio ?? []).map((c) => ({ c, s })),
          );
          return candidates.some(
            ({ c, s }) =>
              c.tabela.toLowerCase() === tables[0] &&
              c.coluna.toLowerCase() === column &&
              c.valor === value &&
              s.conhecimentoPublicado?.colunas.some(
                (col) =>
                  col.tabela.toLowerCase() === c.tabela.toLowerCase() &&
                  col.nome.toLowerCase() === column &&
                  ["livre"].includes(String(col.sensibilidade)),
              ),
          );
        }
        // Only structural numeric literals in bounded LIMIT, CAST, COUNT(1).
        return (
          rec.type === "number" &&
          Number.isInteger(value) &&
          ((structural === "limit" && Number(value) >= 0 && Number(value) <= 10000) ||
            (structural === "ROUND" &&
              parent?.type === "expr_list" &&
              Number(value) >= 0 &&
              Number(value) <= 12) ||
            (["COUNT", "COALESCE"].includes(structural) && [0, 1].includes(Number(value))))
        );
      }
      const fn =
        rec.type === "aggr_func" && typeof rec.name === "string"
          ? rec.name
          : rec.type === "function" &&
              rec.name &&
              typeof rec.name === "object" &&
              "name" in rec.name &&
              Array.isArray(rec.name.name)
            ? String((rec.name.name[0] as { value?: string } | undefined)?.value ?? "")
            : "";
      return Object.entries(rec).every(([k, v]) =>
        walk(v, rec, k, local, k === "limit" ? "limit" : fn ? fn.toUpperCase() : structural),
      );
    };
    return walk(ast);
  } catch {
    return false;
  }
};
