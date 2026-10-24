import { z } from "zod";
import { structureContentSchema } from "./structure-content-schema.js";

export const knowledgeChangeSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("tabela"), value: structureContentSchema.shape.tables.element }),
  z.strictObject({
    kind: z.literal("relacionamento"),
    value: structureContentSchema.shape.relationships.element,
  }),
  z.strictObject({
    kind: z.literal("exemplo_sql"),
    value: structureContentSchema.shape.examples.element,
  }),
  z.strictObject({ kind: z.literal("regra"), value: z.string().trim().min(1).max(5000) }),
]);
export const knowledgeProposalInputSchema = z.strictObject({
  summary: z.string().trim().min(1).max(2000),
  change: knowledgeChangeSchema,
});
export type KnowledgeChange = z.infer<typeof knowledgeChangeSchema>;
export interface KnowledgeProposal {
  readonly id: string;
  readonly catalogId: string;
  readonly patternId: string;
  readonly basePublicationId: string;
  readonly baseHash: string;
  readonly ownerId: string;
  readonly origin: "console" | "mcp";
  readonly personaId: string | null;
  readonly tokenId: string | null;
  readonly grantId: string | null;
  readonly sourceId: string | null;
  readonly skillId: string | null;
  readonly summary: string;
  readonly change: KnowledgeChange;
  readonly hash: string;
  readonly version: number;
  readonly state: "pending" | "incorporated" | "rejected";
  readonly createdAt: string;
  readonly reviewerId: string | null;
  readonly reviewedAt: string | null;
  readonly reason: string | null;
}
export interface CurationPreview {
  readonly hash: string;
  readonly catalogId: string;
  readonly proposalId: string;
  readonly proposalVersion: number;
  readonly patternRevision: number;
  readonly contentHash: string;
  readonly catalogVersion: number;
  readonly ownerId: string;
  readonly expiresAt: Date;
}
export interface KnowledgeCurationTransaction {
  listForConsumer(
    scope: {
      catalogId: string;
      basePublicationId: string;
      personaId: string;
      tokenId: string;
      grantId: string | null;
      skillId: string;
      sourceId: string;
    },
    beforeId?: string,
  ): Promise<{ proposals: readonly KnowledgeProposal[]; nextCursor: string | null }>;
  lockCatalog(catalogId: string): Promise<void>;
  create(proposal: KnowledgeProposal): Promise<void>;
  get(catalogId: string, id: string): Promise<KnowledgeProposal | null>;
  list(
    catalogId: string,
    ownerId: string | null,
    beforeId?: string,
  ): Promise<{ proposals: readonly KnowledgeProposal[]; nextCursor: string | null }>;
  decide(
    catalogId: string,
    id: string,
    version: number,
    decision: "incorporated" | "rejected",
    reviewerId: string,
    reason: string,
    now: Date,
  ): Promise<void>;
  preview(value: CurationPreview): Promise<void>;
  consume(value: CurationPreview, now: Date): Promise<boolean>;
}
