import { z } from "zod";

export const KNOWLEDGE_INDEX_VERSION = 2;
export const KNOWLEDGE_SEARCH_MAX_TERMS = 64;
export const KNOWLEDGE_SEARCH_MAX_RESULTS = 20;
export const KNOWLEDGE_GRAPH_PAGE_SIZE = 50;
export const KNOWLEDGE_GRAPH_MAX_PAGE_SIZE = 100;
export const knowledgeOriginSchema = z.strictObject({
  kind: z.enum(["privado", "padrao", "perfil"]),
  publicationId: z.uuid(),
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  catalogId: z.uuid().optional(),
});
export type KnowledgeOrigin = z.infer<typeof knowledgeOriginSchema>;
export const knowledgeDocumentSchema = z.strictObject({
  id: z.string().min(1).max(1000),
  kind: z.enum(["skill", "table", "column", "relationship", "rule", "example", "parameter"]),
  label: z.string().min(1).max(5000),
  text: z.string().max(20000),
  sourceId: z.uuid().optional(),
  table: z.string().max(200).optional(),
  column: z.string().max(100).optional(),
  origin: knowledgeOriginSchema,
});
export const knowledgeDocumentsSchema = z.array(knowledgeDocumentSchema).max(10000);
export type KnowledgeDocument = z.infer<typeof knowledgeDocumentSchema>;
export interface KnowledgeIndex {
  readonly documents: readonly KnowledgeDocument[];
  readonly hash: string;
}
export const knowledgeGraphInputSchema = z.strictObject({
  skillId: z.uuid(),
  tables: z
    .array(z.strictObject({ fonteId: z.uuid(), table: z.string().min(1).max(200) }))
    .min(1)
    .max(64)
    .optional(),
  pageSize: z
    .number()
    .int()
    .min(1)
    .max(KNOWLEDGE_GRAPH_MAX_PAGE_SIZE)
    .default(KNOWLEDGE_GRAPH_PAGE_SIZE),
  cursor: z.string().min(1).max(24000).optional(),
});
export type KnowledgeGraphInput = z.infer<typeof knowledgeGraphInputSchema>;
export interface KnowledgeNode {
  readonly id: string;
  readonly kind: "table" | "column";
  readonly sourceId: string;
  readonly schema: string | null;
  readonly table: string;
  readonly column?: string;
  readonly meaning: string;
  readonly grain?: readonly string[];
  readonly origin: KnowledgeOrigin;
}
export interface KnowledgeEdge {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly sourceId: string;
  readonly keys: readonly { readonly from: string; readonly to: string }[];
  readonly join: "inner" | "left";
  readonly cardinality: "1:1" | "1:N" | "N:1" | "N:N";
  readonly optional: boolean | null;
  readonly meaning: string;
  readonly via: readonly string[];
  readonly path: readonly string[];
  readonly constraintStatus: "enabled" | "disabled" | "unvalidated" | "unknown" | null;
  readonly origin: KnowledgeOrigin;
}
export interface KnowledgeGraph {
  readonly nodes: readonly KnowledgeNode[];
  readonly edges: readonly KnowledgeEdge[];
  readonly omittedRelationships: number;
}
