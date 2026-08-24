const STOPWORDS = new Set([
  "para",
  "com",
  "por",
  "uma",
  "uns",
  "umas",
  "das",
  "dos",
  "nas",
  "nos",
  "que",
  "sem",
  "mais",
  "pelo",
  "pela",
  "the",
  "and",
  "for",
]);

const stripAccents = (value: string): string =>
  value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export const tokenizeQuery = (query: string): readonly string[] => {
  const normalized = stripAccents(query);
  const raw = normalized.split(/[^a-z0-9]+/).filter((term) => term.length >= 3 && !STOPWORDS.has(term));
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

export const rankByTerms = <T>(
  items: readonly T[],
  terms: readonly string[],
  haystack: (item: T) => string,
  limite: number,
): T[] => {
  if (terms.length === 0) {
    return [];
  }
  return items
    .map((item) => ({ item, score: scoreByTerms(haystack(item), terms) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limite)
    .map((row) => row.item);
};
