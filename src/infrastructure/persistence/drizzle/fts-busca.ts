import { type SQL, or, sql } from "drizzle-orm";
import { tokenizeQuery } from "../busca-termos.js";

export const searchTsv = (qualifiedTable: string): SQL => sql.raw(`${qualifiedTable}.search_tsv`);

export const condicaoFtsOuIlike = (input: {
  readonly qualifiedTable: string;
  readonly query: string;
  readonly ilike: readonly SQL[];
}): SQL | undefined => {
  const fts = sql`${searchTsv(input.qualifiedTable)} @@ plainto_tsquery('portuguese', mcp_unaccent(${input.query}))`;
  const terms = tokenizeQuery(input.query);
  if (terms.length === 0) {
    return fts;
  }
  if (input.ilike.length === 0) {
    return fts;
  }
  const likes = or(...input.ilike);
  return likes ? or(fts, likes) : fts;
};
