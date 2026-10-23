import { z } from "zod";
import type { PersonaServices } from "../../domain/ports/persona-v2.port.js";
import type { ConsumerIdentity } from "../../domain/persona-v2/model.js";
import { PersonaV2Error } from "../../domain/persona-v2/model.js";
import type { PersonaAdministrativeAuthorization } from "./administrative-authorization.js";
import type { PersonaConsumerCatalog } from "./consumer-catalog.js";
import { submitKnowledgeProposal } from "./knowledge-curation.js";
import { canonicalJson } from "../../domain/persona-v2/catalog.js";
import { knowledgeProposalInputSchema } from "../../domain/persona-v2/knowledge-curation.js";
import type { KnowledgeProposal } from "../../domain/persona-v2/knowledge-curation.js";
export const proposeForSkillSchema = knowledgeProposalInputSchema.extend({ skillId: z.uuid() });
export const ownProposalsSchema = z.strictObject({
  skillId: z.uuid(),
  before: z.uuid().optional(),
});

/** Proposals reuse a granted published dependency; never grant arbitrary catalog browsing. */
export class PersonaKnowledgeTraining {
  constructor(
    private readonly services: PersonaServices,
    private readonly authority: PersonaAdministrativeAuthorization,
    private readonly consumer: PersonaConsumerCatalog,
  ) {}
  async listOwn(
    identity: ConsumerIdentity,
    raw: unknown,
  ): Promise<{
    proposals: readonly {
      proposalId: string;
      version: number;
      state: KnowledgeProposal["state"];
      hash: string;
      createdAt: string;
      reviewedAt: string | null;
      published: false;
    }[];
    nextCursor: string | null;
  }> {
    const { skillId, before } = ownProposalsSchema.parse(raw);
    const bound = await this.consumer.readPattern(identity, skillId);
    return this.authority.run(identity, identity.personaId, "treinar", async (tx, context) => {
      if (!tx.knowledge || !context.state)
        throw new PersonaV2Error("CAPABILITY_UNAVAILABLE", "Curadoria indisponível.");
      const current = await this.consumer.sharedInTransaction(tx, identity, context.state, skillId);
      if (canonicalJson(current) !== canonicalJson(bound))
        throw new PersonaV2Error("STALE_AUTHORIZATION", "Dependência mudou.");
      const catalog = await tx.knowledge.catalog(current.knowledge.catalogId, context.ownerId);
      if (!catalog || catalog.role === "reader")
        throw new PersonaV2Error("AUTHORIZATION_DENIED", "Conhecimento indisponível.");
      const page = await tx.knowledge.curation.listForConsumer(
        {
          catalogId: current.knowledge.catalogId,
          basePublicationId: current.knowledge.publicationId,
          personaId: identity.personaId,
          tokenId: identity.tokenId,
          grantId: identity.grant?.id ?? null,
          skillId,
          sourceId: current.sourceId,
        },
        before,
      );
      return {
        proposals: page.proposals.map((p) => ({
          proposalId: p.id,
          version: p.version,
          state: p.state,
          hash: p.hash,
          createdAt: p.createdAt,
          reviewedAt: p.reviewedAt,
          published: false as const,
        })),
        nextCursor: page.nextCursor,
      };
    });
  }
  async propose(
    identity: ConsumerIdentity,
    raw: unknown,
  ): Promise<{
    proposalId: string;
    version: number;
    state: KnowledgeProposal["state"];
    hash: string;
    published: false;
    semanticApproval: false;
  }> {
    const { skillId, ...input } = proposeForSkillSchema.parse(raw);
    const bound = await this.consumer.readPattern(identity, skillId);
    return this.authority.run(identity, identity.personaId, "treinar", async (tx, context) => {
      if (!tx.knowledge || !context.state)
        throw new PersonaV2Error("CAPABILITY_UNAVAILABLE", "Curadoria indisponível.");
      await tx.knowledge.curation.lockCatalog(bound.knowledge.catalogId);
      const current = await this.consumer.sharedInTransaction(tx, identity, context.state, skillId);
      if (canonicalJson(current) !== canonicalJson(bound))
        throw new PersonaV2Error("STALE_AUTHORIZATION", "Dependência mudou; releia a skill.");
      const catalog = await tx.knowledge.catalog(current.knowledge.catalogId, context.ownerId);
      const base = await tx.knowledge.publication(
        current.knowledge.catalogId,
        current.knowledge.publicationId,
      );
      if (!catalog || !base)
        throw new PersonaV2Error("AUTHORIZATION_DENIED", "Conhecimento indisponível.");
      const p = await submitKnowledgeProposal(
        tx.knowledge,
        this.services,
        catalog,
        context.ownerId,
        base,
        input,
        {
          origin: "mcp",
          personaId: identity.personaId,
          tokenId: identity.tokenId,
          grantId: identity.grant?.id ?? null,
          sourceId: current.sourceId,
          skillId,
        },
      );
      return {
        proposalId: p.id,
        version: p.version,
        state: p.state,
        hash: p.hash,
        published: false as const,
        semanticApproval: false as const,
      };
    });
  }
  async get(
    identity: ConsumerIdentity,
    skillId: string,
    id: string,
    includeContent = false,
  ): Promise<{
    proposalId: string;
    version: number;
    state: KnowledgeProposal["state"];
    hash: string;
    reviewedAt: string | null;
    published: false;
    submitted?: Pick<
      KnowledgeProposal,
      "summary" | "change" | "basePublicationId" | "baseHash" | "createdAt"
    >;
  }> {
    const bound = await this.consumer.readPattern(identity, skillId);
    return this.authority.run(identity, identity.personaId, "treinar", async (tx, context) => {
      if (!tx.knowledge || !context.state)
        throw new PersonaV2Error("CAPABILITY_UNAVAILABLE", "Curadoria indisponível.");
      const current = await this.consumer.sharedInTransaction(tx, identity, context.state, skillId);
      if (canonicalJson(current) !== canonicalJson(bound))
        throw new PersonaV2Error("STALE_AUTHORIZATION", "Dependência mudou.");
      const catalog = await tx.knowledge.catalog(current.knowledge.catalogId, context.ownerId),
        p = await tx.knowledge.curation.get(current.knowledge.catalogId, id);
      if (
        !catalog ||
        catalog.role === "reader" ||
        p?.tokenId !== identity.tokenId ||
        p.personaId !== identity.personaId ||
        p.skillId !== skillId
      )
        throw new PersonaV2Error("AUTHORIZATION_DENIED", "Proposta indisponível.");
      if (includeContent && p.grantId !== (identity.grant?.id ?? null))
        throw new PersonaV2Error("AUTHORIZATION_DENIED", "Proposta indisponível.");
      return {
        proposalId: p.id,
        version: p.version,
        state: p.state,
        hash: p.hash,
        reviewedAt: p.reviewedAt,
        published: false as const,
        ...(includeContent
          ? {
              submitted: {
                summary: p.summary,
                change: p.change,
                basePublicationId: p.basePublicationId,
                baseHash: p.baseHash,
                createdAt: p.createdAt,
              },
            }
          : {}),
      };
    });
  }
}
