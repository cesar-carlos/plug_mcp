export const KNOWLEDGE_ORIGIN_LABELS: Readonly<Record<string, string>> = {
  privado: "Treinamento privado",
  padrao: "Padrão compartilhado",
  perfil: "Particularidade da base",
};

export const KNOWLEDGE_KIND_LABELS: Readonly<Record<string, string>> = {
  skill: "Finalidade",
  table: "Tabela",
  column: "Campo",
  relationship: "Relacionamento",
  rule: "Regra",
  example: "Exemplo aprovado",
  parameter: "Parâmetro",
};

export interface KnowledgeSearchItem {
  id: string;
  kind: string;
  label: string;
  origin: { kind: string };
  table?: string;
  column?: string;
  matchedTerms: string[];
}

export interface KnowledgeSearchMatch {
  skillId: string;
  name: string;
  slug: string;
  publicationId: string;
  items: KnowledgeSearchItem[];
  itemsComplete: boolean;
}

export interface KnowledgeFeedbackTarget {
  skillId: string;
  publicationId: string;
  itemId: string;
  label: string;
}

export interface KnowledgeGraphNode {
  id: string;
  kind: "table" | "column";
  schema: string | null;
  table: string;
  column?: string;
  meaning: string;
  origin: { kind: string };
}

export interface KnowledgeGraphEdge {
  id: string;
  from: string;
  to: string;
  keys: readonly { from: string; to: string }[];
  cardinality: string;
  meaning: string;
  via?: readonly string[];
  path?: readonly string[];
}

export interface KnowledgeGraphPage {
  publicationId: string;
  hash: string;
  guidance: string;
  omittedRelationships: number;
  nodes: readonly KnowledgeGraphNode[];
  edges: readonly KnowledgeGraphEdge[];
  page: { nextCursor: string | null; complete: boolean };
}

export interface KnowledgeReview {
  origin: { kind: string };
  state: string;
  dueAt: string | null;
  task: string;
}

export type KnowledgeExplorerRun = (
  action: (current: () => boolean) => Promise<void>,
) => Promise<void>;

export function knowledgeOriginLabel(kind: string): string {
  return KNOWLEDGE_ORIGIN_LABELS[kind] ?? "";
}

export function knowledgeKindLabel(kind: string): string {
  return KNOWLEDGE_KIND_LABELS[kind] ?? "";
}

export function knowledgeReviewStateLabel(state: string): string {
  if (state === "nao_configurada") {
    return "Revisão não configurada";
  }
  if (state === "vencida") {
    return "Revisão vencida";
  }
  return "Revisão em dia";
}

export function knowledgeSearchStatus(matchCount: number, complete: boolean): string {
  if (!matchCount) {
    return "Nenhuma correspondência lexical. Isso não prova ausência de dados ou capacidade.";
  }
  return complete
    ? "Correspondências no conhecimento publicado. Leia a skill antes de consultar."
    : "Primeiras vinte correspondências. Refine os termos para encontrar outros itens.";
}

export function knowledgeExplorerErrorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : "Conhecimento indisponível.";
}

export function knowledgeGraphTableNodes(
  graph: KnowledgeGraphPage | undefined,
): { id: string; name: string }[] {
  return (
    graph?.nodes
      .filter((node) => node.kind === "table")
      .map((node) => ({
        id: node.id,
        name: `${node.schema ? `${node.schema}.` : ""}${node.table}`,
      })) ?? []
  );
}

export function knowledgeGraphNodeName(node: {
  schema: string | null;
  table: string;
  column?: string;
}): string {
  return `${node.schema ? `${node.schema}.` : ""}${node.table}${node.column ? `.${node.column}` : ""}`;
}

export function knowledgeGraphRequest(
  skillId: string,
  previous: KnowledgeGraphPage | undefined,
  append: boolean,
): { skillId: string; pageSize: number; cursor?: string } {
  return {
    skillId,
    pageSize: 50,
    ...(append && previous?.page.nextCursor ? { cursor: previous.page.nextCursor } : {}),
  };
}

export function mergeKnowledgeGraphPage(
  previous: KnowledgeGraphPage | undefined,
  data: KnowledgeGraphPage,
  append: boolean,
): KnowledgeGraphPage {
  if (
    append &&
    previous &&
    (previous.publicationId !== data.publicationId || previous.hash !== data.hash)
  ) {
    throw new Error("Publicação mudou; reinicie a leitura.");
  }
  if (append && previous) {
    return {
      ...data,
      nodes: [...previous.nodes, ...data.nodes],
      edges: [...previous.edges, ...data.edges],
    };
  }
  return data;
}

export function knowledgeFeedbackTarget(
  match: KnowledgeSearchMatch,
  item: KnowledgeSearchItem,
): KnowledgeFeedbackTarget {
  return {
    skillId: match.skillId,
    publicationId: match.publicationId,
    itemId: item.id,
    label: item.label,
  };
}
