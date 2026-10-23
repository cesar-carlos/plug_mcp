import { z } from "zod";
import type { PersonaServices } from "../../domain/ports/persona-v2.port.js";
import { PersonaV2Error, type ConsumerIdentity } from "../../domain/persona-v2/model.js";
import { canonicalJson } from "../../domain/persona-v2/catalog.js";
import { pareceSegredoEmTexto } from "../../domain/entities/parece-segredo.js";
import {
  feedbackInputSchema,
  reviewDecisionSchema,
  type KnowledgeFeedback,
  type KnowledgeMaintenancePort,
  type ReviewCalendar,
  type ReviewTarget,
  type ReviewStatus,
  type ReviewCalendarView,
  type FeedbackReceipt,
} from "../../domain/persona-v2/knowledge-maintenance.js";
import type { PersonaConsumerCatalog } from "./consumer-catalog.js";
import type { PersonaAdministrativeAuthorization } from "./administrative-authorization.js";
import type { PhysicalKnowledgeAuthority } from "./physical-knowledge-authority.js";
import type { SharedKnowledge } from "./shared-knowledge.js";
import { publishedProfileHash } from "./physical-profiles.js";
import type { KnowledgeOrigin } from "../../domain/persona-v2/knowledge-context.js";

export const reviewStatus = (calendar: ReviewCalendar | null, now: Date): ReviewStatus => ({
  state: !calendar
    ? ("nao_configurada" as const)
    : Date.parse(calendar.dueAt) <= now.getTime()
      ? ("vencida" as const)
      : ("em_dia" as const),
  version: calendar?.version ?? 0,
  dueAt: calendar?.dueAt ?? null,
  task:
    calendar && Date.parse(calendar.dueAt) <= now.getTime() ? "Revisar conhecimento publicado" : "",
  checkedAt: now.toISOString(),
  blocksExecution: false as const,
});
export function feedbackHash(value: KnowledgeFeedback, s: Pick<PersonaServices, "crypto">): string {
  const {
    hash: _h,
    version: _v,
    state: _s,
    proposalId: _p,
    proposalKind: _k,
    reviewerId: _r,
    reason: _j,
    ...origin
  } = value;
  return s.crypto.sha256Hex(canonicalJson(origin));
}
export class PersonaKnowledgeMaintenance {
  constructor(
    private readonly s: PersonaServices,
    private readonly consumer: PersonaConsumerCatalog,
    private readonly authority: PersonaAdministrativeAuthorization,
    private readonly physical: PhysicalKnowledgeAuthority,
    private readonly shared: SharedKnowledge,
  ) {}
  async registerFeedback(
    identity: ConsumerIdentity,
    raw: unknown,
  ): Promise<FeedbackReceipt & { semanticApproval: false }> {
    const input = feedbackInputSchema.parse(raw);
    if (pareceSegredoEmTexto(input.content)) {
      throw new PersonaV2Error(
        "INVALID_PLAN",
        "Não envie segredos ou dados de clientes no feedback.",
      );
    }
    return this.consumer.withKnowledge(
      identity,
      input.skillId,
      input.publicationId,
      async (tx, pub, documents) => {
        const item = documents.find((d) => d.id === input.itemId);
        if (!item || !tx.knowledgeMaintenance) {
          throw new PersonaV2Error("AUTHORIZATION_DENIED", "Item de conhecimento indisponível.");
        }
        const value: KnowledgeFeedback = {
          id: this.s.crypto.randomId(),
          personaId: identity.personaId,
          tokenId: identity.tokenId,
          grantId: identity.grant?.id ?? null,
          skillId: input.skillId,
          publicationId: pub.id,
          publicationHash: pub.hash,
          itemId: item.id,
          origin: item.origin,
          type: input.type,
          content: input.content,
          createdAt: this.s.now().toISOString(),
          hash: "",
          version: 1,
          state: "aberto",
          proposalId: null,
          proposalKind: null,
          reviewerId: null,
          reason: null,
        };
        value.hash = feedbackHash(value, this.s);
        await tx.knowledgeMaintenance.createFeedback(value);
        await tx.knowledgeMaintenance.audit(
          identity.personaId,
          pub.skillId,
          pub.id,
          null,
          identity.tokenId,
          "feedback_conhecimento_registrado",
        );
        return {
          feedbackId: value.id,
          hash: value.hash,
          state: value.state,
          version: 1,
          trainingChanged: false,
          semanticApproval: false,
        };
      },
    );
  }
  async ownFeedback(identity: ConsumerIdentity, raw: unknown): Promise<FeedbackReceipt> {
    const input = z
      .strictObject({ skillId: z.uuid(), publicationId: z.uuid(), feedbackId: z.uuid() })
      .parse(raw);
    return this.consumer.withKnowledge(
      identity,
      input.skillId,
      input.publicationId,
      async (tx, pub, documents) => {
        const f = await tx.knowledgeMaintenance?.feedback(identity.personaId, input.feedbackId);
        if (
          f?.tokenId !== identity.tokenId ||
          f.publicationId !== pub.id ||
          f.skillId !== input.skillId ||
          !documents.some((d) => d.id === f.itemId) ||
          feedbackHash(f, this.s) !== f.hash
        ) {
          throw new PersonaV2Error("AUTHORIZATION_DENIED", "Feedback indisponível.");
        }
        return {
          feedbackId: f.id,
          state: f.state,
          version: f.version,
          hash: f.hash,
          trainingChanged: false,
        };
      },
    );
  }
  async consumerReviews(
    identity: ConsumerIdentity,
    skillId: string,
  ): Promise<{
    skillId: string;
    publicationId: string;
    reviews: readonly (ReviewStatus & {
      origin: KnowledgeOrigin;
    })[];
    trainingChanged: false;
  }> {
    return this.consumer.withKnowledge(identity, skillId, null, async (tx, pub, documents) => {
      const origins = [
        { kind: "privado" as const, publicationId: pub.id, hash: pub.hash },
        ...documents.map((d) => d.origin),
      ];
      const unique = new Map(origins.map((o) => [`${o.kind}:${o.publicationId}`, o]));
      const reviews = [];
      for (const o of unique.values()) {
        const target: ReviewTarget = {
          ...o,
          personaId: o.kind === "privado" ? identity.personaId : null,
          catalogId: "catalogId" in o ? (o.catalogId ?? null) : null,
        };
        const calendar = (await tx.knowledgeMaintenance?.calendar(target)) ?? null;
        reviews.push({ origin: o, ...reviewStatus(calendar, this.s.now()) });
      }
      return { skillId, publicationId: pub.id, reviews, trainingChanged: false };
    });
  }
  listFeedback(
    session: string,
    personaId: string,
    raw: unknown,
  ): ReturnType<KnowledgeMaintenancePort["listFeedback"]> {
    const { beforeId } = z.strictObject({ beforeId: z.uuid().optional() }).parse(raw);
    return this.authority.run(session, personaId, "treinar", async (tx) => {
      if (!tx.knowledgeMaintenance) {
        throw new PersonaV2Error("CAPABILITY_UNAVAILABLE", "Feedback indisponível.");
      }
      return tx.knowledgeMaintenance.listFeedback(personaId, null, beforeId);
    });
  }
  decideFeedback(
    session: string,
    personaId: string,
    id: string,
    raw: unknown,
  ): Promise<{ feedbackId: string; state: string; version: number; trainingChanged: false }> {
    const input = z
      .strictObject({
        expectedVersion: z.number().int().positive(),
        reason: z.string().trim().min(1).max(2000),
        proposal: z.strictObject({ id: z.uuid(), kind: z.enum(["padrao", "perfil"]) }).nullable(),
      })
      .parse(raw);
    if (pareceSegredoEmTexto(input.reason)) {
      throw new PersonaV2Error("INVALID_PLAN", "Justificativa contém segredo.");
    }
    return this.authority.run(session, personaId, "treinar", async (tx, context) => {
      const f = await tx.knowledgeMaintenance?.feedback(personaId, id);
      if (!f) {
        throw new PersonaV2Error("AUTHORIZATION_DENIED", "Feedback indisponível.");
      }
      if (f.hash !== feedbackHash(f, this.s)) {
        throw new PersonaV2Error("AUTHORIZATION_DENIED", "Feedback indisponível.");
      }
      if (f.version !== input.expectedVersion || f.state !== "aberto") {
        throw new PersonaV2Error("OPERATION_CONFLICT", "Feedback já tratado.");
      }
      if (input.proposal) {
        const catalogId = f.origin.catalogId;
        const catalog = catalogId ? await tx.knowledge?.catalog(catalogId, context.ownerId) : null;
        if (!catalog || catalog.role === "reader" || input.proposal.kind !== f.origin.kind) {
          throw new PersonaV2Error(
            "AUTHORIZATION_DENIED",
            "Proposta indisponível para esta origem.",
          );
        }
        const p =
          input.proposal.kind === "padrao"
            ? await tx.knowledge?.curation.get(catalogId!, input.proposal.id)
            : await tx.physicalCuration?.get(catalogId!, input.proposal.id);
        if (
          p?.ownerId !== context.ownerId ||
          p.state === "rejected" ||
          ("profilePublicationId" in p ? p.profilePublicationId : p.basePublicationId) !==
            f.origin.publicationId
        ) {
          throw new PersonaV2Error(
            "AUTHORIZATION_DENIED",
            "Proposta não corresponde à origem do feedback.",
          );
        }
      }
      await tx.knowledgeMaintenance!.decideFeedback(
        f,
        context.ownerId,
        input.reason,
        input.proposal,
      );
      await tx.knowledgeMaintenance!.audit(
        personaId,
        f.skillId,
        f.publicationId,
        context.ownerId,
        null,
        "feedback_conhecimento_tratado",
      );
      return {
        feedbackId: id,
        state: input.proposal ? "encaminhado" : "encerrado",
        version: f.version + 1,
        trainingChanged: false,
      };
    });
  }
  private async calendar(
    port: KnowledgeMaintenancePort | undefined,
    target: ReviewTarget,
    owner: string,
    raw?: unknown,
    beforeVersion?: number,
    readTaskId?: string,
  ) {
    if (!port) {
      throw new PersonaV2Error("CAPABILITY_UNAVAILABLE", "Calendário indisponível.");
    }
    if (raw !== undefined) {
      const input = reviewDecisionSchema.parse(raw);
      if (Date.parse(input.dueAt) <= this.s.now().getTime() || pareceSegredoEmTexto(input.reason)) {
        throw new PersonaV2Error(
          "INVALID_PLAN",
          "Escolha prazo futuro explícito e justificativa sem segredos.",
        );
      }
      if (input.decision === "revisado" && input.expectedVersion === 0) {
        throw new PersonaV2Error(
          "INVALID_PLAN",
          "Configure o calendário antes de registrar revisão.",
        );
      }
      await port.saveCalendar(target, input.expectedVersion, {
        version: input.expectedVersion + 1,
        dueAt: input.dueAt,
        ownerId: owner,
        decidedAt: this.s.now().toISOString(),
        decision: input.decision,
        reason: input.reason,
      });
    }
    if (readTaskId) {
      await port.readReviewTask(target, owner, readTaskId);
    }
    const notifications = await port.reviewTasks(target, owner);
    const calendar = await port.calendar(target),
      history = await port.reviewHistory(target, beforeVersion);
    return {
      target,
      notifications,
      ...reviewStatus(calendar, this.s.now()),
      history: history.slice(0, 20),
      nextVersion: history.length > 20 ? history[19]!.version : null,
    };
  }
  standardReview(
    session: string,
    catalogId: string,
    id: string,
    raw?: unknown,
    beforeVersion?: number,
    readTaskId?: string,
  ): Promise<ReviewCalendarView> {
    return this.shared.withPublication(session, catalogId, id, true, async (tx, owner, pub) => {
      const result = await this.calendar(
        tx.maintenance,
        { kind: "padrao", publicationId: pub.id, hash: pub.hash, personaId: null, catalogId },
        owner,
        raw,
        beforeVersion,
        readTaskId,
      );
      if (raw !== undefined) {
        await tx.audit(catalogId, owner, "conhecimento_revisao_registrada", pub.id);
      }
      return result;
    });
  }
  privateReview(
    session: string,
    personaId: string,
    skillId: string,
    id: string,
    raw?: unknown,
    beforeVersion?: number,
    readTaskId?: string,
  ): Promise<ReviewCalendarView> {
    return this.authority.run(session, personaId, "treinar", async (tx, context) => {
      const stored = await tx.catalog.publication(personaId, id);
      const external = stored ? null : await tx.external?.publication(personaId, skillId);
      const pub = stored ?? (external?.id === id ? external : null);
      if (pub?.skillId !== skillId || pub.suspendedAt) {
        throw new PersonaV2Error("AUTHORIZATION_DENIED", "Publicação indisponível.");
      }
      const result = await this.calendar(
        tx.knowledgeMaintenance,
        { kind: "privado", publicationId: id, hash: pub.hash, personaId, catalogId: null },
        context.ownerId,
        raw,
        beforeVersion,
        readTaskId,
      );
      if (raw !== undefined) {
        await tx.knowledgeMaintenance!.audit(
          personaId,
          skillId,
          id,
          context.ownerId,
          null,
          "conhecimento_revisao_registrada",
        );
      }
      return result;
    });
  }
  physicalReview(
    session: string,
    personaId: string,
    sourceId: string,
    catalogId: string,
    id: string,
    raw?: unknown,
    beforeVersion?: number,
    readTaskId?: string,
  ): Promise<ReviewCalendarView> {
    return this.physical.run(
      session,
      personaId,
      sourceId,
      catalogId,
      "curator",
      async (tx, source, owner) => {
        const pub = await tx.profiles!.publication(catalogId, id);
        const base = pub ? await tx.knowledge?.publication(catalogId, pub.basePublicationId) : null;
        if (
          !pub ||
          pub.suspended ||
          pub.identityHash !== source.identityHash ||
          pub.physicalSourceId !== source.physicalSourceId ||
          publishedProfileHash(pub, this.s) !== pub.hash ||
          !base ||
          base.suspendedAt ||
          base.hash !== pub.baseHash
        ) {
          throw new PersonaV2Error("AUTHORIZATION_DENIED", "Perfil indisponível nesta base.");
        }
        const result = await this.calendar(
          tx.knowledgeMaintenance,
          { kind: "perfil", publicationId: id, hash: pub.hash, personaId: null, catalogId },
          owner,
          raw,
          beforeVersion,
          readTaskId,
        );
        if (raw !== undefined) {
          await tx.knowledge!.audit(catalogId, owner, "perfil_revisao_registrada", id);
        }
        return result;
      },
    );
  }
}
