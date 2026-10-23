import { z } from "zod";
import { knowledgeProposalInputSchema, type KnowledgeChange } from "./knowledge-curation.js";

export const physicalProposalInputSchema = knowledgeProposalInputSchema.extend({
  profilePublicationId: z.uuid(),
  overrideCommon: z.boolean().default(false),
});
export const physicalProposalDecisionSchema = z.strictObject({
  confirmationHash: z.string().regex(/^[a-f0-9]{64}$/),
  reason: z.string().trim().min(1).max(2000),
});
export interface PhysicalKnowledgeProposal {
  readonly id: string;
  readonly catalogId: string;
  readonly profileId: string;
  readonly profilePublicationId: string;
  readonly profileHash: string;
  readonly basePublicationId: string;
  readonly baseHash: string;
  readonly physicalSourceId: string;
  readonly identityHash: string;
  readonly sourceVersion: number;
  readonly credentialVersion: number;
  readonly ownerId: string;
  readonly origin: "console" | "mcp";
  readonly personaId: string;
  readonly sourceId: string;
  readonly tokenId: string | null;
  readonly grantId: string | null;
  readonly skillId: string | null;
  readonly summary: string;
  readonly change: KnowledgeChange;
  readonly overrideCommon: boolean;
  readonly createdAt: string;
  readonly hash: string;
  readonly version: number;
  readonly state: "pending" | "incorporated" | "rejected";
  readonly reviewerId: string | null;
  readonly reviewedAt: string | null;
  readonly reason: string | null;
}
export interface PhysicalCurationTransaction {
  listForConsumer(input: {
    catalogId: string;
    physicalSourceId: string;
    identityHash: string;
    profilePublicationId: string;
    personaId: string;
    sourceId: string;
    tokenId: string;
    grantId: string | null;
    skillId: string;
    before?: string;
  }): Promise<{ proposals: readonly PhysicalKnowledgeProposal[]; nextCursor: string | null }>;
  create(proposal: PhysicalKnowledgeProposal): Promise<void>;
  get(catalogId: string, id: string): Promise<PhysicalKnowledgeProposal | null>;
  list(input: {
    catalogId: string;
    physicalSourceId: string;
    identityHash: string;
    profilePublicationId: string;
    ownerId: string | null;
    beforeId?: string;
  }): Promise<{ proposals: readonly PhysicalKnowledgeProposal[]; nextCursor: string | null }>;
  preview(
    hash: string,
    catalogId: string,
    proposalId: string,
    binding: string,
    expiresAt: Date,
  ): Promise<void>;
  consume(
    hash: string,
    catalogId: string,
    proposalId: string,
    binding: string,
    now: Date,
  ): Promise<boolean>;
  decide(
    proposal: PhysicalKnowledgeProposal,
    decision: "incorporated" | "rejected",
    ownerId: string,
    reason: string,
    now: Date,
  ): Promise<void>;
}
