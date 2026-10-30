import { expect, it } from "vitest";
import {
  knowledgeSearchTerms,
  matchingKnowledgeTerms,
} from "../../src/application/persona-v2/knowledge-search.js";
import { publicationKnowledgeDocuments } from "../../src/application/persona-v2/knowledge-documents.js";
import { compileQueryTraining } from "../../src/application/persona-v2/query-training.js";
import { NodeCryptoAdapter } from "../../src/infrastructure/crypto/node-crypto.adapter.js";
import { queryTraining, trainingSource } from "../helpers/persona-v2-training.js";
import type { CatalogPublication } from "../../src/domain/persona-v2/catalog.js";

it("measures lexical recall and first-match rank on a synthetic commercial vocabulary", () => {
  const crypto = new NodeCryptoAdapter("a".repeat(64));
  const corpus = [
    {
      id: "net",
      purpose: "Indicador líquido",
      synonyms: ["receita", "faturamento", "vendas líquidas"],
    },
    {
      id: "stock",
      purpose: "Posição física",
      synonyms: ["estoque", "saldo físico", "mercadoria disponível"],
    },
    {
      id: "returns",
      purpose: "Reversões",
      synonyms: ["devoluções", "estornos", "mercadoria devolvida"],
    },
  ].map((item) => {
    const pkg = compileQueryTraining(
      {
        ...queryTraining(),
        purpose: item.purpose,
        semantics: { version: 1, synonyms: item.synonyms, metrics: [] },
      },
      trainingSource,
      crypto,
    );
    const publication: CatalogPublication = {
      id: item.id,
      personaId: trainingSource.personaId,
      skillId: item.id,
      revision: 1,
      package: pkg,
      hash: item.id,
      sourceVersion: 1,
      sourceFingerprint: pkg.sourceFingerprint,
      suspendedAt: null,
    };
    return { id: item.id, documents: publicationKnowledgeDocuments(publication) };
  });
  const cases = [
    ["Qual a receita?", "net"],
    ["VENDAS LÍQUIDAS", "net"],
    ["faturamento", "net"],
    ["saldo físico", "stock"],
    ["estoque disponível", "stock"],
    ["devolucoes", "returns"],
  ];
  const ranks = cases.map(([question, expected]) => {
    const terms = knowledgeSearchTerms(question!, 20);
    const ranked = corpus
      .map((item) => ({
        id: item.id,
        score: new Set(item.documents.flatMap((doc) => matchingKnowledgeTerms(doc.text, terms)))
          .size,
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    return ranked.findIndex((item) => item.id === expected) + 1;
  });
  const recallAt3 = ranks.filter((rank) => rank > 0 && rank <= 3).length / ranks.length;
  const reciprocalRank =
    ranks.reduce((sum, rank) => sum + (rank > 0 ? 1 / rank : 0), 0) / ranks.length;
  expect(recallAt3).toBe(1);
  expect(reciprocalRank).toBe(1);
  const unknown = knowledgeSearchTerms("lucro tributável", 20);
  expect(
    corpus.every((item) =>
      item.documents.every((doc) => matchingKnowledgeTerms(doc.text, unknown).length === 0),
    ),
  ).toBe(true);
  // Ambiguity stays visible; retrieval must not silently choose an execution source.
  const ambiguous = knowledgeSearchTerms("mercadoria", 20);
  expect(
    corpus
      .filter((item) =>
        item.documents.some((doc) => matchingKnowledgeTerms(doc.text, ambiguous).length),
      )
      .map((item) => item.id),
  ).toEqual(["stock", "returns"]);
});
