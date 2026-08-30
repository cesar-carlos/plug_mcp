import { type SQL, or, sql } from "drizzle-orm";
import { tokenizeQuery } from "../busca-termos.js";

export const searchTsv = (qualifiedTable: string): SQL => sql.raw(`${qualifiedTable}.search_tsv`);

export const janelaBuscaFts = (limite: number): number => Math.max(limite * 4, 32);

export const exprTsRank = (qualifiedTable: string, query: string): SQL =>
  sql`coalesce(ts_rank(${searchTsv(qualifiedTable)}, plainto_tsquery('portuguese', mcp_unaccent(${query}))), 0)`;

export const ordemPorTsRank = (qualifiedTable: string, query: string): SQL =>
  sql`${exprTsRank(qualifiedTable, query)} desc`;

export const toRankFts = (value: unknown): number => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
};

export const existeIlikeJsonbArray = (
  jsonArray: SQL,
  fields: readonly string[],
  like: string,
): SQL => {
  const preds = fields.map((field) => sql`coalesce(elem->>${field}, '') ilike ${like}`);
  const where = or(...preds) ?? sql`false`;
  return sql`exists (select 1 from jsonb_array_elements(${jsonArray}) as elem where ${where})`;
};

export const condicaoFtsOuIlike = (input: {
  readonly qualifiedTable: string;
  readonly query: string;
  readonly ilike: readonly SQL[];
}): SQL | undefined => {
  const likes = input.ilike.length > 0 ? or(...input.ilike) : undefined;
  const terms = tokenizeQuery(input.query);
  if (terms.length === 0) {
    return likes;
  }
  const fts = sql`${searchTsv(input.qualifiedTable)} @@ plainto_tsquery('portuguese', mcp_unaccent(${input.query}))`;
  if (!likes) {
    return fts;
  }
  return or(fts, likes);
};
