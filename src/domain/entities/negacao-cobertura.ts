/**
 * Complemento de negação na descrição da skill não entra no vocabulário de cobertura.
 * “Não agrega estoque” não autoriza o token estoque.
 * Cada cláusula (“não … e não …”) é um span próprio — o segundo “não” não é
 * engolido como palavra do primeiro.
 */
import { stemsDeTexto } from "./stem-portugues.js";
import { STOPWORDS_CAPACIDADE } from "./stopwords-busca.js";

const spanNegado = (): RegExp =>
  /\b(?:n[aã]o|nao|sem|proibid[oa]s?|nunca)\s+[\p{L}0-9_-]+(?:\s+(?!(?:n[aã]o|nao|sem|proibid)\b)[\p{L}0-9_-]+){0,4}/giu;

export const stripComplementoNegado = (text: string): string =>
  text.replace(spanNegado(), " ").replace(/\s+/g, " ").trim();

export const stemsNegadosNaDescricao = (text: string): readonly string[] => {
  const spans = text.match(spanNegado()) ?? [];
  return [...new Set(spans.flatMap((span) => [...stemsDeTexto(span, STOPWORDS_CAPACIDADE)]))];
};
