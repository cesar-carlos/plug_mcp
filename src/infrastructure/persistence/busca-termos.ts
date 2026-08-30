import type { HitBusca } from "../../domain/entities/hit-busca.js";
import { rankFromTermScore } from "../../domain/entities/hit-busca.js";
import { STOPWORDS_BUSCA } from "../../domain/entities/stopwords-busca.js";

const stripAccents = (value: string): string =>
  value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export const tokenizeQuery = (query: string): readonly string[] => {
  const normalized = stripAccents(query);
  const raw = normalized
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length >= 3 && !STOPWORDS_BUSCA.has(term));
  const unique = [...new Set(raw)];
  if (unique.length === 0) {
    const compact = normalized.replace(/[^a-z0-9]+/g, "");
    return compact.length >= 2 ? [compact] : [];
  }
  return unique;
};

export const scoreByTerms = (haystack: string, terms: readonly string[]): number => {
  if (terms.length === 0) {
    return 0;
  }
  const hay = stripAccents(haystack);
  return terms.reduce((score, term) => score + (hay.includes(term) ? 1 : 0), 0);
};

export const rankByTermsHits = <T>(
  items: readonly T[],
  terms: readonly string[],
  haystack: (item: T) => string,
  limite: number,
): HitBusca<T>[] => {
  if (terms.length === 0) {
    return [];
  }
  return items
    .map((item) => ({ item, score: scoreByTerms(haystack(item), terms) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limite)
    .map((row) => ({
      item: row.item,
      rank: rankFromTermScore(row.score, terms.length),
    }));
};

export const rankByTerms = <T>(
  items: readonly T[],
  terms: readonly string[],
  haystack: (item: T) => string,
  limite: number,
): T[] => rankByTermsHits(items, terms, haystack, limite).map((hit) => hit.item);
