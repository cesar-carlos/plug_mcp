import { z } from "zod";
import type { PersonaServices, PersonaTransaction } from "../../domain/ports/persona-v2.port.js";
import {
  PersonaV2Error,
  PREPARATION_TTL_MS,
  type ConsumerIdentity,
  type Source,
} from "../../domain/persona-v2/model.js";
import type { KnowledgeCatalog } from "../../domain/persona-v2/shared-knowledge.js";
import type {
  PhysicalProfilePublication,
  PhysicalProfile,
} from "../../domain/persona-v2/physical-profile.js";
import {
  physicalProposalInputSchema,
  physicalProposalDecisionSchema,
  type PhysicalKnowledgeProposal,
} from "../../domain/persona-v2/physical-curation.js";
import { knowledgeProposalInputSchema } from "../../domain/persona-v2/knowledge-curation.js";
import { canonicalJson } from "../../domain/persona-v2/catalog.js";
import { applyKnowledgeChange, proposalTarget } from "./knowledge-curation.js";
import { composePhysicalContent, publishedProfileHash } from "./physical-profiles.js";
import type { PhysicalKnowledgeAuthority } from "./physical-knowledge-authority.js";
import type { PersonaConsumerCatalog } from "./consumer-catalog.js";
import { pareceSegredoEmTexto } from "../../domain/entities/parece-segredo.js";
import { compareStructureContent } from "./shared-structure-diff.js";

export const proposePhysicalForSkillSchema = knowledgeProposalInputSchema.extend({
  skillId: z.uuid(),
  overrideCommon: z.boolean().default(false),
});
export const ownPhysicalProposalsSchema = z.strictObject({
  skillId: z.uuid(),
  before: z.uuid().optional(),
});
export interface PhysicalCurationScope {
  personaId: string;
  sourceId: string;
  catalogId: string;
  profilePublicationId: string;
}
export function physicalProposalHash(
  p: PhysicalKnowledgeProposal,
  services: Pick<PersonaServices, "crypto">,
): string {
  const {
    hash: _h,
    version: _v,
    state: _s,
    reviewerId: _r,
    reviewedAt: _a,
    reason: _j,
    ...payload
  } = p;
  return services.crypto.sha256Hex(canonicalJson(payload));
}
export function applyPhysicalProposal(
  draft: PhysicalProfile,
  base: PhysicalProfilePublication,
  p: Pick<PhysicalKnowledgeProposal, "change" | "overrideCommon">,
  services: Pick<PersonaServices, "crypto" | "now">,
): PhysicalProfile {
  if (
    canonicalJson(proposalTarget(base.content, p.change)) !==
    canonicalJson(proposalTarget(draft.content, p.change))
  )
    throw new PersonaV2Error(
      "OPERATION_CONFLICT",
      "Definição mudou desde a versão-base. Resolva explicitamente e envie nova proposta.",
    );
  const content = applyKnowledgeChange(draft.content, p.change, services);
  const overrides = {
    tables: [...draft.overrides.tables],
    relationships: [...draft.overrides.relationships],
  };
  if (p.overrideCommon) {
    if (p.change.kind !== "tabela" && p.change.kind !== "relacionamento")
      throw new PersonaV2Error(
        "INVALID_PLAN",
        "Substituição explícita aplica-se somente a tabelas ou relacionamentos comuns.",
      );
    const field = p.change.kind === "tabela" ? "tables" : "relationships";
    if (!overrides[field].includes(p.change.value.id)) overrides[field].push(p.change.value.id);
  }
  return { ...draft, content, overrides };
}
export class PersonaPhysicalCuration {
  constructor(
    private readonly s: PersonaServices,
    private readonly authority: PhysicalKnowledgeAuthority,
    private readonly consumer: PersonaConsumerCatalog,
  ) {}
  private async publication(
    tx: PersonaTransaction,
    scope: PhysicalCurationScope,
    source: Source,
  ): Promise<PhysicalProfilePublication> {
    const pub = await tx.profiles?.publication(scope.catalogId, scope.profilePublicationId);
    const base = pub
      ? await tx.knowledge?.publication(scope.catalogId, pub.basePublicationId)
      : null;
    if (
      !pub ||
      pub.suspended ||
      pub.physicalSourceId !== source.physicalSourceId ||
      pub.identityHash !== source.identityHash ||
      !base ||
      base.suspendedAt ||
      base.hash !== pub.baseHash ||
      base.hash !== this.s.crypto.sha256Hex(canonicalJson(base.content)) ||
      publishedProfileHash(pub, this.s) !== pub.hash ||
      !tx.physicalCuration
    )
      throw new PersonaV2Error(
        "AUTHORIZATION_DENIED",
        "Perfil publicado indisponível nesta base e catálogo.",
      );
    return pub;
  }
  private async submit(
    tx: PersonaTransaction,
    source: Source,
    ownerId: string,
    scope: PhysicalCurationScope,
    raw: unknown,
    origin: Pick<PhysicalKnowledgeProposal, "origin" | "tokenId" | "grantId" | "skillId">,
  ): Promise<PhysicalKnowledgeProposal> {
    const input = physicalProposalInputSchema.parse(raw);
    if (
      input.profilePublicationId !== scope.profilePublicationId ||
      pareceSegredoEmTexto(canonicalJson(input))
    )
      throw new PersonaV2Error(
        "INVALID_PLAN",
        "Proposta inválida ou contém segredo; use conteúdo sintético e parâmetros.",
      );
    const pub = await this.publication(tx, scope, source);
    const change =
      input.change.kind === "exemplo_sql"
        ? { ...input.change, value: { ...input.change.value, state: "candidate" as const } }
        : input.change;
    const proposal: PhysicalKnowledgeProposal = {
      id: this.s.crypto.randomId(),
      catalogId: scope.catalogId,
      profileId: pub.id,
      profilePublicationId: pub.publicationId,
      profileHash: pub.hash,
      basePublicationId: pub.basePublicationId,
      baseHash: pub.baseHash,
      physicalSourceId: source.physicalSourceId,
      identityHash: source.identityHash!,
      sourceVersion: source.authorizationVersion,
      credentialVersion: source.credentialVersion,
      ownerId,
      personaId: scope.personaId,
      sourceId: source.id,
      ...origin,
      summary: input.summary,
      change,
      overrideCommon: input.overrideCommon,
      createdAt: this.s.now().toISOString(),
      hash: "",
      version: 1,
      state: "pending",
      reviewerId: null,
      reviewedAt: null,
      reason: null,
    };
    const next = applyPhysicalProposal(pub, pub, proposal, this.s);
    const base = (await tx.knowledge!.publication(scope.catalogId, pub.basePublicationId))!;
    composePhysicalContent(base.content, next.content, next.overrides);
    const frozen = { ...proposal, hash: physicalProposalHash(proposal, this.s) };
    await tx.physicalCuration!.create(frozen);
    await tx.knowledge!.audit(scope.catalogId, ownerId, "particularidade_proposta", frozen.id);
    return frozen;
  }
  propose(
    sessionId: string,
    scope: PhysicalCurationScope,
    raw: unknown,
  ): Promise<PhysicalKnowledgeProposal> {
    return this.authority.run(
      sessionId,
      scope.personaId,
      scope.sourceId,
      scope.catalogId,
      "contributor",
      (tx, source, owner) =>
        this.submit(tx, source, owner, scope, raw, {
          origin: "console",
          tokenId: null,
          grantId: null,
          skillId: null,
        }),
    );
  }
  async proposeForSkill(
    identity: ConsumerIdentity,
    raw: unknown,
  ): Promise<{
    proposalId: string;
    hash: string;
    version: number;
    state: PhysicalKnowledgeProposal["state"];
    published: false;
    semanticApproval: false;
  }> {
    const { skillId, ...input } = proposePhysicalForSkillSchema.parse(raw);
    const bound = await this.consumer.readPattern(identity, skillId);
    if (!bound.knowledge.profilePublicationId)
      throw new PersonaV2Error(
        "AUTHORIZATION_DENIED",
        "A skill não adota perfil físico concedido.",
      );
    const scope = {
      personaId: identity.personaId,
      sourceId: bound.sourceId,
      catalogId: bound.knowledge.catalogId,
      profilePublicationId: bound.knowledge.profilePublicationId,
    };
    return this.authority.run(
      identity,
      scope.personaId,
      scope.sourceId,
      scope.catalogId,
      "contributor",
      async (tx, source, owner) => {
        const state = await tx.authorization(identity);
        if (
          !state ||
          canonicalJson(await this.consumer.sharedInTransaction(tx, identity, state, skillId)) !==
            canonicalJson(bound)
        )
          throw new PersonaV2Error("STALE_AUTHORIZATION", "Dependência mudou; releia a skill.");
        const p = await this.submit(
          tx,
          source,
          owner,
          scope,
          { ...input, profilePublicationId: scope.profilePublicationId },
          {
            origin: "mcp",
            tokenId: identity.tokenId,
            grantId: identity.grant?.id ?? null,
            skillId,
          },
        );
        return {
          proposalId: p.id,
          hash: p.hash,
          version: p.version,
          state: p.state,
          published: false,
          semanticApproval: false,
        };
      },
    );
  }
  async getForSkill(
    identity: ConsumerIdentity,
    skillId: string,
    id: string,
    includeContent = false,
  ): Promise<{
    proposalId: string;
    state: PhysicalKnowledgeProposal["state"];
    version: number;
    hash: string;
    reviewedAt: string | null;
    published: false;
    submitted?: Pick<
      PhysicalKnowledgeProposal,
      | "summary"
      | "change"
      | "overrideCommon"
      | "profilePublicationId"
      | "profileHash"
      | "basePublicationId"
      | "baseHash"
      | "createdAt"
    >;
  }> {
    const bound = await this.consumer.readPattern(identity, skillId);
    if (!bound.knowledge.profilePublicationId)
      throw new PersonaV2Error("AUTHORIZATION_DENIED", "Perfil indisponível.");
    const scope = {
      personaId: identity.personaId,
      sourceId: bound.sourceId,
      catalogId: bound.knowledge.catalogId,
      profilePublicationId: bound.knowledge.profilePublicationId,
    };
    return this.authority.run(
      identity,
      scope.personaId,
      scope.sourceId,
      scope.catalogId,
      "contributor",
      async (tx, source) => {
        const state = await tx.authorization(identity);
        if (
          !state ||
          canonicalJson(await this.consumer.sharedInTransaction(tx, identity, state, skillId)) !==
            canonicalJson(bound)
        )
          throw new PersonaV2Error("STALE_AUTHORIZATION", "Dependência mudou.");
        await this.publication(tx, scope, source);
        const p = await this.require(tx, scope, id);
        if (
          p.tokenId !== identity.tokenId ||
          p.skillId !== skillId ||
          p.personaId !== identity.personaId
        )
          throw new PersonaV2Error("AUTHORIZATION_DENIED", "Proposta indisponível.");
        if (includeContent && p.grantId !== (identity.grant?.id ?? null))
          throw new PersonaV2Error("AUTHORIZATION_DENIED", "Proposta indisponível.");
        return {
          proposalId: p.id,
          state: p.state,
          version: p.version,
          hash: p.hash,
          reviewedAt: p.reviewedAt,
          published: false,
          ...(includeContent
            ? {
                submitted: {
                  summary: p.summary,
                  change: p.change,
                  overrideCommon: p.overrideCommon,
                  profilePublicationId: p.profilePublicationId,
                  profileHash: p.profileHash,
                  basePublicationId: p.basePublicationId,
                  baseHash: p.baseHash,
                  createdAt: p.createdAt,
                },
              }
            : {}),
        };
      },
    );
  }
  async listOwn(
    identity: ConsumerIdentity,
    raw: unknown,
  ): Promise<{
    proposals: readonly {
      proposalId: string;
      state: PhysicalKnowledgeProposal["state"];
      version: number;
      hash: string;
      createdAt: string;
      reviewedAt: string | null;
      published: false;
    }[];
    nextCursor: string | null;
  }> {
    const { skillId, before } = ownPhysicalProposalsSchema.parse(raw);
    const bound = await this.consumer.readPattern(identity, skillId);
    if (!bound.knowledge.profilePublicationId)
      throw new PersonaV2Error("AUTHORIZATION_DENIED", "Perfil indisponível.");
    const scope = {
      personaId: identity.personaId,
      sourceId: bound.sourceId,
      catalogId: bound.knowledge.catalogId,
      profilePublicationId: bound.knowledge.profilePublicationId,
    };
    return this.authority.run(
      identity,
      scope.personaId,
      scope.sourceId,
      scope.catalogId,
      "contributor",
      async (tx, source) => {
        const state = await tx.authorization(identity);
        if (
          !state ||
          canonicalJson(await this.consumer.sharedInTransaction(tx, identity, state, skillId)) !==
            canonicalJson(bound)
        )
          throw new PersonaV2Error("STALE_AUTHORIZATION", "Dependência mudou.");
        await this.publication(tx, scope, source);
        const page = await tx.physicalCuration!.listForConsumer({
          ...scope,
          physicalSourceId: source.physicalSourceId,
          identityHash: source.identityHash!,
          tokenId: identity.tokenId,
          grantId: identity.grant?.id ?? null,
          skillId,
          ...(before ? { before } : {}),
        });
        for (const p of page.proposals) {
          if (p.hash !== physicalProposalHash(p, this.s))
            throw new PersonaV2Error("AUTHORIZATION_DENIED", "Proposta indisponível.");
        }
        return {
          proposals: page.proposals.map((p) => ({
            proposalId: p.id,
            state: p.state,
            version: p.version,
            hash: p.hash,
            createdAt: p.createdAt,
            reviewedAt: p.reviewedAt,
            published: false as const,
          })),
          nextCursor: page.nextCursor,
        };
      },
    );
  }
  async list(
    sessionId: string,
    scope: PhysicalCurationScope,
    raw: unknown,
  ): Promise<{
    proposals: readonly PhysicalKnowledgeProposal[];
    nextCursor: string | null;
    mayReview: boolean;
  }> {
    const { beforeId } = z.strictObject({ beforeId: z.uuid().optional() }).parse(raw);
    return this.authority.run(
      sessionId,
      scope.personaId,
      scope.sourceId,
      scope.catalogId,
      "contributor",
      async (tx, source, owner, catalog) => {
        await this.publication(tx, scope, source);
        const mayReview = ["administrator", "curator"].includes(catalog.role);
        return {
          ...(await tx.physicalCuration!.list({
            ...scope,
            physicalSourceId: source.physicalSourceId,
            identityHash: source.identityHash!,
            ownerId: mayReview ? null : owner,
            ...(beforeId ? { beforeId } : {}),
          })),
          mayReview,
        };
      },
    );
  }
  private async require(
    tx: PersonaTransaction,
    scope: PhysicalCurationScope,
    id: string,
  ): Promise<PhysicalKnowledgeProposal> {
    const p = await tx.physicalCuration?.get(scope.catalogId, id);
    if (
      p?.profilePublicationId !== scope.profilePublicationId ||
      p.hash !== physicalProposalHash(p, this.s)
    )
      throw new PersonaV2Error("AUTHORIZATION_DENIED", "Proposta indisponível.");
    return p;
  }
  private async prepare(
    tx: PersonaTransaction,
    scope: PhysicalCurationScope,
    source: Source,
    id: string,
  ) {
    const pub = await this.publication(tx, scope, source),
      p = await this.require(tx, scope, id),
      draft = await tx.profiles!.get(scope.catalogId, p.profileId);
    if (p.state !== "pending")
      throw new PersonaV2Error("OPERATION_CONFLICT", "Proposta já revisada.");
    if (
      !draft ||
      p.profileHash !== pub.hash ||
      draft.identityHash !== source.identityHash ||
      draft.physicalSourceId !== source.physicalSourceId ||
      draft.basePublicationId !== pub.basePublicationId ||
      draft.baseHash !== pub.baseHash
    )
      throw new PersonaV2Error("STALE_AUTHORIZATION", "Perfil ou identidade divergente.");
    const next = applyPhysicalProposal(draft, pub, p, this.s),
      base = (await tx.knowledge!.publication(scope.catalogId, p.basePublicationId))!;
    composePhysicalContent(base.content, next.content, next.overrides);
    return { p, draft, next };
  }
  private binding(
    prepared: Awaited<ReturnType<PersonaPhysicalCuration["prepare"]>>,
    source: Source,
    owner: string,
    catalog: KnowledgeCatalog,
  ): string {
    return this.s.crypto.sha256Hex(
      canonicalJson({
        proposal: prepared.p.hash,
        version: prepared.p.version,
        draft: prepared.draft,
        next: prepared.next,
        source,
        owner,
        catalogVersion: catalog.authorizationVersion,
      }),
    );
  }
  review(
    sessionId: string,
    scope: PhysicalCurationScope,
    id: string,
    raw: unknown,
    action: "preview" | "incorporar" | "rejeitar",
  ): Promise<unknown> {
    if (action === "rejeitar") {
      const input = z
        .strictObject({
          expectedVersion: z.number().int().positive(),
          reason: physicalProposalDecisionSchema.shape.reason,
        })
        .parse(raw);
      if (pareceSegredoEmTexto(input.reason))
        throw new PersonaV2Error("INVALID_PLAN", "Justificativa contém segredo.");
      return this.authority.run(
        sessionId,
        scope.personaId,
        scope.sourceId,
        scope.catalogId,
        "curator",
        async (tx, source, owner) => {
          await this.publication(tx, scope, source);
          const p = await this.require(tx, scope, id);
          if (p.version !== input.expectedVersion || p.state !== "pending")
            throw new PersonaV2Error("OPERATION_CONFLICT", "Proposta já revisada ou alterada.");
          await tx.physicalCuration!.decide(p, "rejected", owner, input.reason, this.s.now());
          await tx.knowledge!.audit(scope.catalogId, owner, "particularidade_rejeitada", id);
          return { proposalId: id, state: "rejected", published: false };
        },
      );
    }
    const decision =
      action === "preview"
        ? (z.strictObject({}).parse(raw), null)
        : physicalProposalDecisionSchema.parse(raw);
    if (decision && pareceSegredoEmTexto(decision.reason))
      throw new PersonaV2Error("INVALID_PLAN", "Justificativa contém segredo.");
    return this.authority.run(
      sessionId,
      scope.personaId,
      scope.sourceId,
      scope.catalogId,
      "curator",
      async (tx, source, owner, catalog) => {
        const prepared = await this.prepare(tx, scope, source, id),
          binding = this.binding(prepared, source, owner, catalog);
        if (action === "preview") {
          const hash = this.s.crypto.sha256Hex(this.s.crypto.randomToken(32)),
            expiresAt = new Date(this.s.now().getTime() + PREPARATION_TTL_MS);
          await tx.physicalCuration!.preview(hash, scope.catalogId, id, binding, expiresAt);
          return {
            confirmationHash: hash,
            expiresAt,
            content: prepared.next.content,
            profileRevision: prepared.draft.revision,
            changes: compareStructureContent(prepared.draft.content, prepared.next.content),
            overrides: prepared.next.overrides,
            semanticApproval: false,
            published: false,
          };
        }
        if (
          !(await tx.physicalCuration!.consume(
            decision!.confirmationHash,
            scope.catalogId,
            id,
            binding,
            this.s.now(),
          ))
        )
          throw new PersonaV2Error(
            "OPERATION_CONFLICT",
            "Revisão expirada, alterada ou já utilizada.",
          );
        await tx.profiles!.save(
          { ...prepared.next, revision: prepared.draft.revision + 1 },
          prepared.draft.revision,
        );
        await tx.physicalCuration!.decide(
          prepared.p,
          "incorporated",
          owner,
          decision!.reason,
          this.s.now(),
        );
        await tx.knowledge!.audit(scope.catalogId, owner, "particularidade_incorporada", id);
        return {
          proposalId: id,
          state: "incorporated",
          profileId: prepared.draft.id,
          revision: prepared.draft.revision + 1,
          published: false,
          semanticApproval: false,
        };
      },
    );
  }
}
