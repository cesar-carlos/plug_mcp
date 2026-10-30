import { normalizeKnowledgeText } from "./knowledge-documents.js";

/** Lexical only. Callers must authorize publications before supplying their documents. */
export function knowledgeSearchTerms(question: string, maxTerms: number): string[] {
  return [...new Set(normalizeKnowledgeText(question).match(/[\p{L}\p{N}]+/gu) ?? [])]
    .filter((term) => term.length > 2)
    .slice(0, maxTerms);
}
export function matchingKnowledgeTerms(content: string, terms: readonly string[]): string[] {
  return terms.filter((term) => content.includes(term));
}
