import { z } from "zod";
import type { PersonaServices } from "../../domain/ports/persona-v2.port.js";
import type {
  KnowledgeCatalog,
  SharedKnowledgeTransaction,
  StructureContent,
  StructurePublication,
} from "../../domain/persona-v2/shared-knowledge.js";
import {
  knowledgeProposalInputSchema,
  type KnowledgeProposal,
  type KnowledgeChange,
  type CurationPreview,
} from "../../domain/persona-v2/knowledge-curation.js";
import { canonicalJson } from "../../domain/persona-v2/catalog.js";
import { PersonaV2Error, PREPARATION_TTL_MS } from "../../domain/persona-v2/model.js";
import { validateStructureContent } from "./shared-structure-schema.js";
import { compareStructureContent, type StructureChange } from "./shared-structure-diff.js";
import { pareceSegredoEmTexto } from "../../domain/entities/parece-segredo.js";

type Services = Pick<PersonaServices, "crypto" | "now">;
type SessionAuthority = <T>(
  sessionId: string,
  catalogId: string,
  action: (
    tx: SharedKnowledgeTransaction,
    ownerId: string,
    catalog: KnowledgeCatalog,
  ) => Promise<T>,
) => Promise<T>;
const curator = (catalog: KnowledgeCatalog): void => {
  if (!["administrator", "curator"].includes(catalog.role))
    throw new PersonaV2Error("AUTHORIZATION_DENIED", "Revisão exige curador autenticado.");
};
const contributor = (catalog: KnowledgeCatalog): void => {
  if (catalog.role === "reader")
    throw new PersonaV2Error("AUTHORIZATION_DENIED", "Papel não permite propor conhecimento.");
};
const safeReason = (raw: unknown): string => {
  const reason = z.string().trim().min(1).max(2000).parse(raw);
  if (pareceSegredoEmTexto(reason))
    throw new PersonaV2Error("INVALID_PLAN", "Justificativa contém segredo.");
  return reason;
};
export function proposalTarget(content: StructureContent, change: KnowledgeChange): unknown {
  if (change.kind === "regra") return content.rules.includes(change.value) ? change.value : null;
  const values =
    change.kind === "tabela"
      ? content.tables
      : change.kind === "relacionamento"
        ? content.relationships
        : content.examples;
  return values.find((v) => v.id === change.value.id) ?? null;
}
export function applyKnowledgeChange(
  content: StructureContent,
  change: KnowledgeChange,
  services: Services,
): StructureContent {
  if (change.kind === "regra")
    return validateStructureContent(
      { ...content, rules: [...new Set([...content.rules, change.value])] },
      services.crypto,
    );
  const field =
    change.kind === "tabela"
      ? "tables"
      : change.kind === "relacionamento"
        ? "relationships"
        : "examples";
  const value =
    change.kind === "exemplo_sql" ? { ...change.value, state: "candidate" as const } : change.value;
  const next = {
    ...content,
    [field]: [...content[field].filter((item) => item.id !== value.id), value],
  };
  return validateStructureContent(next, services.crypto);
}
export function proposalHash(p: KnowledgeProposal, services: Services): string {
  const {
    hash: _hash,
    version: _version,
    state: _state,
    reviewerId: _reviewer,
    reviewedAt: _at,
    reason: _reason,
    ...payload
  } = p;
  return services.crypto.sha256Hex(canonicalJson(payload));
}
export async function submitKnowledgeProposal(
  tx: SharedKnowledgeTransaction,
  services: Services,
  catalog: KnowledgeCatalog,
  ownerId: string,
  base: StructurePublication,
  raw: unknown,
  origin: Pick<
    KnowledgeProposal,
    "origin" | "personaId" | "tokenId" | "grantId" | "sourceId" | "skillId"
  >,
): Promise<KnowledgeProposal> {
  contributor(catalog);
  const input = knowledgeProposalInputSchema.parse(raw);
  if (pareceSegredoEmTexto(canonicalJson(input)))
    throw new PersonaV2Error(
      "INVALID_PLAN",
      "Proposta contém segredo; use parâmetros e conteúdo sintético.",
    );
  if (
    base.catalogId !== catalog.id ||
    base.suspendedAt ||
    services.crypto.sha256Hex(canonicalJson(base.content)) !== base.hash
  )
    throw new PersonaV2Error("AUTHORIZATION_DENIED", "Versão base indisponível.");
  const change: KnowledgeChange =
    input.change.kind === "exemplo_sql"
      ? { ...input.change, value: { ...input.change.value, state: "candidate" } }
      : input.change;
  applyKnowledgeChange(base.content, change, services);
  const proposal: KnowledgeProposal = {
    id: services.crypto.randomId(),
    catalogId: catalog.id,
    patternId: base.patternId,
    basePublicationId: base.id,
    baseHash: base.hash,
    ownerId,
    ...origin,
    summary: input.summary,
    change,
    hash: "",
    version: 1,
    state: "pending",
    createdAt: services.now().toISOString(),
    reviewerId: null,
    reviewedAt: null,
    reason: null,
  };
  const frozen = { ...proposal, hash: proposalHash(proposal, services) };
  await tx.curation.create(frozen);
  await tx.audit(catalog.id, ownerId, "conhecimento_proposto", frozen.id);
  return frozen;
}
export class SharedKnowledgeCuration {
  constructor(
    private readonly services: Services,
    private readonly authorized: SessionAuthority,
  ) {}
  async propose(sessionId: string, catalogId: string, raw: unknown): Promise<KnowledgeProposal> {
    const { basePublicationId, ...input } = knowledgeProposalInputSchema
      .extend({ basePublicationId: z.uuid() })
      .parse(raw);
    return this.authorized(sessionId, catalogId, async (tx, owner, catalog) => {
      const base = await tx.publication(catalogId, basePublicationId);
      if (!base) throw new PersonaV2Error("AUTHORIZATION_DENIED", "Versão base indisponível.");
      return submitKnowledgeProposal(tx, this.services, catalog, owner, base, input, {
        origin: "console",
        personaId: null,
        tokenId: null,
        grantId: null,
        sourceId: null,
        skillId: null,
      });
    });
  }
  async list(
    sessionId: string,
    catalogId: string,
    raw: unknown,
  ): ReturnType<SharedKnowledgeTransaction["curation"]["list"]> {
    const { beforeId } = z.strictObject({ beforeId: z.uuid().optional() }).parse(raw);
    return this.authorized(sessionId, catalogId, async (tx, owner, catalog) => {
      contributor(catalog);
      return tx.curation.list(
        catalogId,
        ["administrator", "curator"].includes(catalog.role) ? null : owner,
        beforeId,
      );
    });
  }
  async get(sessionId: string, catalogId: string, id: string): Promise<KnowledgeProposal> {
    return this.authorized(sessionId, catalogId, async (tx, owner, catalog) => {
      contributor(catalog);
      const proposal = await this.require(tx, catalogId, id);
      if (catalog.role === "contributor" && proposal.ownerId !== owner)
        throw new PersonaV2Error("AUTHORIZATION_DENIED", "Proposta indisponível.");
      return proposal;
    });
  }
  private async require(
    tx: SharedKnowledgeTransaction,
    catalogId: string,
    id: string,
  ): Promise<KnowledgeProposal> {
    const p = await tx.curation.get(catalogId, id);
    if (!p) throw new PersonaV2Error("AUTHORIZATION_DENIED", "Proposta indisponível.");
    if (p.hash !== proposalHash(p, this.services))
      throw new PersonaV2Error("AUTHORIZATION_DENIED", "Proposta indisponível.");
    return p;
  }
  private async prepare(tx: SharedKnowledgeTransaction, catalogId: string, id: string) {
    const proposal = await this.require(tx, catalogId, id),
      base = await tx.publication(catalogId, proposal.basePublicationId),
      draft = await tx.draft(catalogId, proposal.patternId);
    if (proposal.state !== "pending")
      throw new PersonaV2Error("OPERATION_CONFLICT", "Proposta já revisada.");
    if (base?.hash !== proposal.baseHash || base.suspendedAt || !draft)
      throw new PersonaV2Error("AUTHORIZATION_DENIED", "Proposta perdeu sua versão base.");
    if (
      canonicalJson(proposalTarget(base.content, proposal.change)) !==
      canonicalJson(proposalTarget(draft.content, proposal.change))
    )
      throw new PersonaV2Error(
        "OPERATION_CONFLICT",
        "Definição já mudou no rascunho. Resolva o conflito explicitamente e envie outra proposta.",
      );
    const content = applyKnowledgeChange(draft.content, proposal.change, this.services);
    return {
      proposal,
      draft,
      content,
      contentHash: this.services.crypto.sha256Hex(canonicalJson(content)),
    };
  }
  async preview(
    sessionId: string,
    catalogId: string,
    id: string,
  ): Promise<{
    confirmationHash: string;
    expiresAt: Date;
    proposalVersion: number;
    patternRevision: number;
    contentHash: string;
    content: StructureContent;
    changes: readonly StructureChange[];
    semanticApproval: false;
    published: false;
  }> {
    return this.authorized(sessionId, catalogId, async (tx, owner, catalog) => {
      curator(catalog);
      const p = await this.prepare(tx, catalogId, id),
        expiresAt = new Date(this.services.now().getTime() + PREPARATION_TTL_MS),
        hash = this.services.crypto.sha256Hex(this.services.crypto.randomToken(32));
      await tx.curation.preview({
        hash,
        catalogId,
        proposalId: id,
        proposalVersion: p.proposal.version,
        patternRevision: p.draft.revision,
        contentHash: p.contentHash,
        catalogVersion: catalog.authorizationVersion,
        ownerId: owner,
        expiresAt,
      });
      return {
        confirmationHash: hash,
        expiresAt,
        proposalVersion: p.proposal.version,
        patternRevision: p.draft.revision,
        contentHash: p.contentHash,
        content: p.content,
        changes: compareStructureContent(p.draft.content, p.content),
        semanticApproval: false as const,
        published: false as const,
      };
    });
  }
  async incorporate(
    sessionId: string,
    catalogId: string,
    id: string,
    raw: unknown,
  ): Promise<{
    proposalId: string;
    state: "incorporated";
    patternId: string;
    revision: number;
    published: false;
    semanticApproval: false;
  }> {
    const input = z
        .strictObject({ confirmationHash: z.string().regex(/^[a-f0-9]{64}$/), reason: z.string() })
        .parse(raw),
      reason = safeReason(input.reason);
    return this.authorized(sessionId, catalogId, async (tx, owner, catalog) => {
      curator(catalog);
      const p = await this.prepare(tx, catalogId, id);
      const expected: CurationPreview = {
        hash: input.confirmationHash,
        catalogId,
        proposalId: id,
        proposalVersion: p.proposal.version,
        patternRevision: p.draft.revision,
        contentHash: p.contentHash,
        catalogVersion: catalog.authorizationVersion,
        ownerId: owner,
        expiresAt: this.services.now(),
      };
      if (!(await tx.curation.consume(expected, this.services.now())))
        throw new PersonaV2Error(
          "OPERATION_CONFLICT",
          "Revisão expirada, alterada ou já usada. Revise novamente.",
        );
      const draft = { ...p.draft, content: p.content, revision: p.draft.revision + 1 };
      await tx.saveDraft(draft, p.draft.revision);
      await tx.curation.decide(
        catalogId,
        id,
        p.proposal.version,
        "incorporated",
        owner,
        reason,
        this.services.now(),
      );
      await tx.audit(catalogId, owner, "proposta_incorporada", id);
      return {
        proposalId: id,
        state: "incorporated" as const,
        patternId: draft.id,
        revision: draft.revision,
        published: false as const,
        semanticApproval: false as const,
      };
    });
  }
  async reject(
    sessionId: string,
    catalogId: string,
    id: string,
    raw: unknown,
  ): Promise<{ state: "rejected" }> {
    const input = z
        .strictObject({ expectedVersion: z.number().int().positive(), reason: z.string() })
        .parse(raw),
      reason = safeReason(input.reason);
    return this.authorized(sessionId, catalogId, async (tx, owner, catalog) => {
      curator(catalog);
      await this.require(tx, catalogId, id);
      await tx.curation.decide(
        catalogId,
        id,
        input.expectedVersion,
        "rejected",
        owner,
        reason,
        this.services.now(),
      );
      await tx.audit(catalogId, owner, "proposta_rejeitada", id);
      return { state: "rejected" };
    });
  }
}
