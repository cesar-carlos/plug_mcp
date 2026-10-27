import { expect, it } from "vitest";
import {
  knowledgeExplorerErrorMessage,
  knowledgeFeedbackTarget,
  knowledgeGraphNodeName,
  knowledgeGraphRequest,
  knowledgeGraphTableNodes,
  knowledgeKindLabel,
  knowledgeOriginLabel,
  knowledgeReviewStateLabel,
  knowledgeSearchStatus,
  mergeKnowledgeGraphPage,
  type KnowledgeGraphPage,
  type KnowledgeSearchMatch,
} from "./knowledge-explorer";

const page = (overrides: Partial<KnowledgeGraphPage> = {}): KnowledgeGraphPage => ({
  publicationId: "pub-1",
  hash: "hash-1",
  guidance: "Recorte concedido.",
  omittedRelationships: 0,
  nodes: [
    {
      id: "orders",
      kind: "table",
      schema: "public",
      table: "orders",
      meaning: "Pedidos",
      origin: { kind: "padrao" },
    },
    {
      id: "orders.id",
      kind: "column",
      schema: "public",
      table: "orders",
      column: "id",
      meaning: "Chave",
      origin: { kind: "privado" },
    },
  ],
  edges: [
    {
      id: "rel",
      from: "orders",
      to: "items",
      keys: [{ from: "id", to: "order_id" }],
      cardinality: "1:N",
      meaning: "Itens",
    },
  ],
  page: { nextCursor: "cursor-2", complete: false },
  ...overrides,
});

it("rotula origem, tipo e prazo sem autorizar execução", () => {
  expect(knowledgeOriginLabel("privado")).toBe("Treinamento privado");
  expect(knowledgeOriginLabel("padrao")).toBe("Padrão compartilhado");
  expect(knowledgeOriginLabel("perfil")).toBe("Particularidade da base");
  expect(knowledgeOriginLabel("desconhecido")).toBe("");
  expect(knowledgeKindLabel("example")).toBe("Exemplo aprovado");
  expect(knowledgeKindLabel("column")).toBe("Campo");
  expect(knowledgeReviewStateLabel("nao_configurada")).toBe("Revisão não configurada");
  expect(knowledgeReviewStateLabel("vencida")).toBe("Revisão vencida");
  expect(knowledgeReviewStateLabel("em_dia")).toBe("Revisão em dia");
});

it("distingue busca vazia, recorte e corte das vinte skills", () => {
  expect(knowledgeSearchStatus(0, true)).toBe(
    "Nenhuma correspondência lexical. Isso não prova ausência de dados ou capacidade.",
  );
  expect(knowledgeSearchStatus(1, true)).toBe(
    "Correspondências no conhecimento publicado. Leia a skill antes de consultar.",
  );
  expect(knowledgeSearchStatus(2, false)).toBe(
    "Primeiras vinte correspondências. Refine os termos para encontrar outros itens.",
  );
});

it("concatena páginas do grafo e recusa hash divergente", () => {
  const first = page();
  const second = page({
    nodes: [
      {
        id: "items",
        kind: "table",
        schema: null,
        table: "items",
        meaning: "Itens",
        origin: { kind: "perfil" },
      },
    ],
    edges: [],
    page: { nextCursor: null, complete: true },
  });
  expect(knowledgeGraphRequest("skill-1", first, true)).toEqual({
    skillId: "skill-1",
    pageSize: 50,
    cursor: "cursor-2",
  });
  expect(knowledgeGraphRequest("skill-1", first, false)).toEqual({
    skillId: "skill-1",
    pageSize: 50,
  });
  const merged = mergeKnowledgeGraphPage(first, second, true);
  expect(merged.nodes.map((node) => node.id)).toEqual(["orders", "orders.id", "items"]);
  expect(merged.page.complete).toBe(true);
  expect(mergeKnowledgeGraphPage(undefined, second, false)).toEqual(second);
  expect(() => mergeKnowledgeGraphPage(first, page({ hash: "outro" }), true)).toThrow(
    "Publicação mudou; reinicie a leitura.",
  );
  expect(knowledgeGraphTableNodes(first)).toEqual([{ id: "orders", name: "public.orders" }]);
  expect(knowledgeGraphTableNodes(undefined)).toEqual([]);
  expect(knowledgeGraphNodeName(first.nodes[0])).toBe("public.orders");
  expect(knowledgeGraphNodeName(first.nodes[1])).toBe("public.orders.id");
  expect(knowledgeGraphNodeName({ schema: null, table: "items" })).toBe("items");
});

it("prepara o alvo de feedback e preserva mensagem de falha", () => {
  const match: KnowledgeSearchMatch = {
    skillId: "skill-1",
    name: "Pedidos",
    slug: "pedidos",
    publicationId: "pub-1",
    itemsComplete: true,
    items: [
      {
        id: "item-1",
        kind: "table",
        label: "Pedidos",
        origin: { kind: "padrao" },
        matchedTerms: ["pedido"],
      },
    ],
  };
  expect(knowledgeFeedbackTarget(match, match.items[0])).toEqual({
    skillId: "skill-1",
    publicationId: "pub-1",
    itemId: "item-1",
    label: "Pedidos",
  });
  expect(knowledgeExplorerErrorMessage(new Error("Token de outra persona."))).toBe(
    "Token de outra persona.",
  );
  expect(knowledgeExplorerErrorMessage("x")).toBe("Conhecimento indisponível.");
});
