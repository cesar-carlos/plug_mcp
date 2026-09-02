/**
 * Complemento de negação na descrição da skill não entra no vocabulário de cobertura.
 * “Não agrega estoque” não autoriza o token estoque.
 * Cada cláusula (“não … e não …”) é um span próprio — o segundo “não” não é
 * engolido como palavra do primeiro.
 * Lista após verbo negado (“não autoriza cruzar vendas, compras nem títulos”)
 * exclui todos os complementos — não só o token antes da vírgula.
 */
import { stemsDeTexto } from "./stem-portugues.js";
import { STOPWORDS_CAPACIDADE } from "./stopwords-busca.js";

const NEG = String.raw`(?:n[aã]o|nao|sem|proibid[oa]s?|nunca)`;
const TOKEN = String.raw`[\p{L}0-9_-]+`;
const SEP = String.raw`(?:\s*,\s*|\s+(?:nem|ou)\s+|\s+e\s+(?!${NEG}\b)|\s+)`;

const spanNegado = (): RegExp =>
  new RegExp(String.raw`\b${NEG}\s+${TOKEN}(?:${SEP}(?!${NEG}\b)${TOKEN}){0,4}`, "giu");

export const stripComplementoNegado = (text: string): string =>
  text.replace(spanNegado(), " ").replace(/\s+/g, " ").trim();

export const stemsNegadosNaDescricao = (text: string): readonly string[] => {
  const spans = text.match(spanNegado()) ?? [];
  return [...new Set(spans.flatMap((span) => [...stemsDeTexto(span, STOPWORDS_CAPACIDADE)]))];
};
