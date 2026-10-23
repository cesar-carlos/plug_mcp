import { z } from "zod";
import {
  knowledgeImpactQuerySchema,
  impactResource,
} from "../../domain/persona-v2/knowledge-impact.js";
import type {
  KnowledgeCatalog,
  KnowledgeImpact,
  KnowledgeMember,
  SharedKnowledgeRepositoryPort,
  SharedKnowledgeTransaction,
  StructureDraft,
  StructureContent,
  StructurePublication,
} from "../../domain/persona-v2/shared-knowledge.js";
import type { PersonaServices } from "../../domain/ports/persona-v2.port.js";
import { PersonaV2Error, PREPARATION_TTL_MS } from "../../domain/persona-v2/model.js";
import { canonicalJson } from "../../domain/persona-v2/catalog.js";
import { pareceSegredoEmTexto } from "../../domain/entities/parece-segredo.js";
import { compareStructureContent, type StructureChange } from "./shared-structure-diff.js";
import { SharedKnowledgeCuration } from "./knowledge-curation.js";
import { PersonaKnowledgeLibrary } from "./knowledge-library.js";
import type { PersonaAdministration } from "./administration.js";
import {
  publicationReviewPlan,
  confirmPublicationReview,
  createPublicationCalendar,
} from "./review-publication.js";
import {
  knowledgeRoleSchema,
  structureDraftInputSchema,
  validateStructureContent,
} from "./shared-structure-schema.js";

const nameSchema = z.string().trim().min(1).max(200);
const revisionSchema = z.number().int().positive();
export interface SharedStructurePreviewResult {
  reviewDueAt: string;
  confirmationHash: string;
  expiresAt: Date;
  revision: number;
  packageHash: string;
  content: StructureContent;
  previousPublicationId: string | null;
  changedFields: string[];
  changes: readonly StructureChange[];
  warnings: string[];
}
export class SharedKnowledge {
  readonly library: PersonaKnowledgeLibrary;
  readonly curation: SharedKnowledgeCuration;
  /** Internal unit of work for a curator's separate calendar, never a snapshot mutation. */
  withPublication<T>(
    sessionId: string,
    catalogId: string,
    publicationId: string,
    mutate: boolean,
    action: (
      tx: SharedKnowledgeTransaction,
      ownerId: string,
      publication: StructurePublication,
    ) => Promise<T>,
  ): Promise<T> {
    return this.authorized(sessionId, catalogId, async (tx, owner, catalog) => {
      if (mutate) this.assertRole(catalog!, "publish");
      const publication = await tx.publication(catalogId, publicationId);
      if (
        !publication ||
        publication.suspendedAt ||
        publication.hash !== this.services.crypto.sha256Hex(canonicalJson(publication.content))
      )
        throw new PersonaV2Error("AUTHORIZATION_DENIED", "Publicação indisponível.");
      return action(tx, owner, publication);
    });
  }
  constructor(
    private readonly services: PersonaServices,
    private readonly administration: PersonaAdministration,
    private readonly repository: SharedKnowledgeRepositoryPort,
  ) {
    this.library = new PersonaKnowledgeLibrary(services, (session, catalog, action) =>
      this.authorized(session, catalog, (tx, owner, scope) => action(tx, owner, scope!)),
    );
    this.curation = new SharedKnowledgeCuration(services, (session, catalog, action) =>
      this.authorized(session, catalog, (tx, owner, scope) => action(tx, owner, scope!)),
    );
  }
  private async authorized<T>(
    sessionId: string,
    catalogId: string | null,
    action: (
      tx: SharedKnowledgeTransaction,
      ownerId: string,
      catalog: KnowledgeCatalog | null,
    ) => Promise<T>,
  ): Promise<T> {
    const session = await this.administration.validateSession(sessionId);
    return this.repository.transaction(
      catalogId,
      async (tx) => {
        const catalog = catalogId ? await tx.catalog(catalogId, session.owner.id) : null;
        if (catalogId && !catalog) {
          throw new PersonaV2Error("AUTHORIZATION_DENIED", "Catálogo indisponível.");
        }
        return action(tx, session.owner.id, catalog);
      },
      () => {
        const live = this.services.sessions.find(sessionId, this.services.now());
        if (live?.owner.id !== session.owner.id || session.expiresAt <= this.services.now()) {
          throw new PersonaV2Error("AUTHORIZATION_DENIED", "Sessão expirou antes da gravação.");
        }
      },
    );
  }
  private assertRole(c: KnowledgeCatalog, operation: "members" | "draft" | "publish"): void {
    const allowed =
      operation === "members"
        ? ["administrator"]
        : operation === "publish"
          ? ["administrator", "curator"]
          : ["administrator", "curator", "contributor"];
    if (!allowed.includes(c.role)) {
      throw new PersonaV2Error("AUTHORIZATION_DENIED", "Papel não permite esta ação.");
    }
  }
  async list(sessionId: string): Promise<readonly KnowledgeCatalog[]> {
    return this.authorized(sessionId, null, (tx, ownerId) => tx.list(ownerId));
  }
  async impact(
    sessionId: string,
    catalogId: string,
    publicationId: string,
    raw: unknown,
  ): Promise<KnowledgeImpact> {
    const input = knowledgeImpactQuerySchema.parse(raw);
    return this.authorized(sessionId, catalogId, async (tx, ownerId) => {
      const publication = await tx.publication(catalogId, publicationId);
      if (!publication)
        throw new PersonaV2Error("AUTHORIZATION_DENIED", "Publicação indisponível.");
      if (publication.hash !== this.services.crypto.sha256Hex(canonicalJson(publication.content)))
        throw new PersonaV2Error("AUTHORIZATION_DENIED", "Publicação indisponível.");
      return tx.impact(
        catalogId,
        publicationId,
        ownerId,
        input.after,
        "padrao",
        impactResource(input),
      );
    });
  }
  async create(sessionId: string, raw: unknown): Promise<KnowledgeCatalog> {
    const { name } = z.strictObject({ name: nameSchema }).parse(raw);
    if (pareceSegredoEmTexto(name)) {
      throw new PersonaV2Error("INVALID_PLAN", "Nome contém segredo.");
    }
    return this.authorized(sessionId, null, async (tx, ownerId) => {
      const catalog: KnowledgeCatalog = {
        id: this.services.crypto.randomId(),
        ownerId,
        name,
        role: "administrator",
        authorizationVersion: 1,
      };
      await tx.createCatalog(catalog);
      await tx.audit(catalog.id, ownerId, "catalogo_criado", catalog.id);
      return catalog;
    });
  }
  async members(sessionId: string, catalogId: string): Promise<readonly KnowledgeMember[]> {
    return this.authorized(sessionId, catalogId, (tx, _ownerId, catalog) => {
      this.assertRole(catalog!, "members");
      return tx.members(catalogId);
    });
  }
  async setMember(sessionId: string, catalogId: string, raw: unknown): Promise<void> {
    const input = z
      .strictObject({
        expectedVersion: revisionSchema,
        hubClientId: z
          .string()
          .trim()
          .regex(/^[A-Za-z0-9_-]+$/)
          .max(200),
        role: knowledgeRoleSchema.nullable(),
      })
      .parse(raw);
    return this.authorized(sessionId, catalogId, async (tx, ownerId, catalog) => {
      this.assertRole(catalog!, "members");
      if (catalog!.authorizationVersion !== input.expectedVersion) {
        throw new PersonaV2Error("OPERATION_CONFLICT", "Membros mudaram; recarregue.");
      }
      const hubOrigin = this.services.ownerAuth.hubOrigin;
      const targetId = await tx.resolveOwner(hubOrigin, input.hubClientId);
      if (targetId === catalog!.ownerId && input.role !== "administrator") {
        throw new PersonaV2Error(
          "INVALID_PLAN",
          "O criador deve manter administração do catálogo.",
        );
      }
      await tx.setMember(
        catalogId,
        input.role
          ? { ownerId: targetId, hubOrigin, hubClientId: input.hubClientId, role: input.role }
          : null,
        targetId,
      );
      await tx.audit(catalogId, ownerId, "catalogo_membro_alterado", targetId);
    });
  }
  async listPatterns(
    sessionId: string,
    catalogId: string,
  ): Promise<
    { patterns: readonly StructureDraft[] } | { publications: readonly StructurePublication[] }
  > {
    return this.authorized(sessionId, catalogId, async (tx, _ownerId, catalog) => {
      const drafts = await tx.drafts(catalogId);
      if (catalog!.role !== "reader") {
        return { patterns: drafts };
      }
      const publications: StructurePublication[] = [];
      for (const draft of drafts) {
        const pub = draft.activePublicationId
          ? await tx.publication(catalogId, draft.activePublicationId)
          : null;
        if (pub && !pub.suspendedAt) {
          publications.push(pub);
        }
      }
      return { publications };
    });
  }
  async createPattern(sessionId: string, catalogId: string, raw: unknown): Promise<StructureDraft> {
    const input = structureDraftInputSchema.parse(raw);
    const content = validateStructureContent(input.content, this.services.crypto);
    if (pareceSegredoEmTexto(input.name)) {
      throw new PersonaV2Error("INVALID_PLAN", "Nome contém segredo.");
    }
    return this.authorized(sessionId, catalogId, async (tx, ownerId, catalog) => {
      this.assertRole(catalog!, "draft");
      const draft: StructureDraft = {
        id: this.services.crypto.randomId(),
        catalogId,
        ...input,
        content,
        revision: 1,
        activePublicationId: null,
      };
      await tx.saveDraft(draft, null);
      await tx.audit(catalogId, ownerId, "padrao_rascunho_criado", draft.id);
      return draft;
    });
  }
  async updatePattern(
    sessionId: string,
    catalogId: string,
    patternId: string,
    raw: unknown,
  ): Promise<StructureDraft> {
    const input = structureDraftInputSchema
      .omit({ slug: true })
      .extend({ expectedRevision: revisionSchema })
      .parse(raw);
    const content = validateStructureContent(input.content, this.services.crypto);
    if (pareceSegredoEmTexto(input.name)) {
      throw new PersonaV2Error("INVALID_PLAN", "Nome contém segredo.");
    }
    return this.authorized(sessionId, catalogId, async (tx, ownerId, catalog) => {
      this.assertRole(catalog!, "draft");
      const previous = await this.requireDraft(tx, catalogId, patternId);
      if (previous.revision !== input.expectedRevision) {
        throw new PersonaV2Error("OPERATION_CONFLICT", "Rascunho mudou.");
      }
      const draft: StructureDraft = {
        ...previous,
        name: input.name,
        content,
        revision: previous.revision + 1,
      };
      await tx.saveDraft(draft, input.expectedRevision);
      await tx.audit(catalogId, ownerId, "padrao_rascunho_atualizado", patternId);
      return draft;
    });
  }
  async preview(
    sessionId: string,
    catalogId: string,
    patternId: string,
    reviewDueAt?: unknown,
  ): Promise<SharedStructurePreviewResult> {
    return this.authorized(sessionId, catalogId, async (tx, ownerId, catalog) => {
      this.assertRole(catalog!, "publish");
      const draft = await this.requireDraft(tx, catalogId, patternId);
      validateStructureContent(draft.content, this.services.crypto);
      const packageHash = this.services.crypto.sha256Hex(canonicalJson(draft.content));
      const reviewPlan = await publicationReviewPlan(
        tx.maintenance,
        {
          kind: "padrao",
          draftId: patternId,
          personaId: null,
          catalogId,
          revision: draft.revision,
          hash: packageHash,
        },
        ownerId,
        this.services.now(),
        reviewDueAt,
      );
      const hash = this.services.crypto.sha256Hex(this.services.crypto.randomToken(32));
      const expiresAt = new Date(this.services.now().getTime() + PREPARATION_TTL_MS);
      await tx.savePreview({
        hash,
        catalogId,
        patternId,
        ownerId,
        revision: draft.revision,
        catalogVersion: catalog!.authorizationVersion,
        packageHash,
        previousPublicationId: draft.activePublicationId,
        expiresAt,
      });
      const previous = draft.activePublicationId
        ? await tx.publication(catalogId, draft.activePublicationId)
        : null;
      await tx.maintenance!.bindReviewPlan(hash, reviewPlan);
      return {
        reviewDueAt: reviewPlan.dueAt,
        confirmationHash: hash,
        expiresAt,
        revision: draft.revision,
        packageHash,
        content: draft.content,
        previousPublicationId: previous?.id ?? null,
        changedFields: Object.keys(draft.content).filter(
          (key) =>
            canonicalJson(previous?.content[key as keyof typeof draft.content] ?? null) !==
            canonicalJson(draft.content[key as keyof typeof draft.content]),
        ),
        changes: previous
          ? compareStructureContent(previous.content, draft.content)
          : [{ kind: "added", path: "pattern" }],
        warnings: [
          "Publicação descreve o padrão; não comprova compatibilidade de uma base nem autoriza execução.",
          ...(draft.content.examples.some((e) => e.state === "candidate")
            ? ["Exemplos candidatos exigem revisão explícita antes de publicar."]
            : []),
        ],
      };
    });
  }
  async publish(
    sessionId: string,
    catalogId: string,
    patternId: string,
    raw: unknown,
  ): Promise<StructurePublication> {
    const { confirmationHash } = z
      .strictObject({ confirmationHash: z.string().regex(/^[a-f0-9]{64}$/) })
      .parse(raw);
    return this.authorized(sessionId, catalogId, async (tx, ownerId, catalog) => {
      this.assertRole(catalog!, "publish");
      const preview = await tx.preview(catalogId, confirmationHash);
      const draft = await this.requireDraft(tx, catalogId, patternId);
      const hash = this.services.crypto.sha256Hex(canonicalJson(draft.content));
      if (draft.content.examples.some((e) => e.state === "candidate"))
        throw new PersonaV2Error(
          "INVALID_PLAN",
          "Revise os exemplos candidatos antes de publicar: aprove, inative ou substitua cada um.",
        );
      if (
        preview?.patternId !== patternId ||
        preview.ownerId !== ownerId ||
        preview.expiresAt <= this.services.now() ||
        preview.revision !== draft.revision ||
        preview.previousPublicationId !== draft.activePublicationId ||
        preview.catalogVersion !== catalog!.authorizationVersion ||
        preview.packageHash !== hash
      ) {
        throw new PersonaV2Error(
          "OPERATION_CONFLICT",
          "Preview expirado, alterado ou de outro responsável.",
        );
      }
      const publication: StructurePublication = {
        id: this.services.crypto.randomId(),
        catalogId,
        patternId,
        revision: draft.revision,
        content: draft.content,
        hash,
        publishedAt: this.services.now().toISOString(),
        suspendedAt: null,
      };
      await tx.publish(publication, confirmationHash, this.services.now());
      const reviewPlan = await confirmPublicationReview(
        tx.maintenance,
        {
          kind: "padrao",
          draftId: patternId,
          personaId: null,
          catalogId,
          revision: draft.revision,
          hash,
        },
        confirmationHash,
        this.services.now(),
      );
      await createPublicationCalendar(
        tx.maintenance!,
        { kind: "padrao", publicationId: publication.id, hash, personaId: null, catalogId },
        reviewPlan,
        this.services.now(),
      );
      await tx.audit(catalogId, ownerId, "padrao_publicado", publication.id);
      return publication;
    });
  }
  async publication(
    sessionId: string,
    catalogId: string,
    publicationId: string,
  ): Promise<StructurePublication> {
    return this.authorized(sessionId, catalogId, async (tx, _ownerId, catalog) => {
      const publication = await tx.publication(catalogId, publicationId);
      if (!publication || (publication.suspendedAt && catalog!.role === "reader")) {
        throw new PersonaV2Error("AUTHORIZATION_DENIED", "Publicação indisponível.");
      }
      return publication;
    });
  }
  async suspend(sessionId: string, catalogId: string, publicationId: string): Promise<void> {
    return this.authorized(sessionId, catalogId, async (tx, ownerId, catalog) => {
      this.assertRole(catalog!, "publish");
      if (!(await tx.publication(catalogId, publicationId))) {
        throw new PersonaV2Error("AUTHORIZATION_DENIED", "Publicação indisponível.");
      }
      await tx.suspend(catalogId, publicationId, ownerId);
      await tx.audit(catalogId, ownerId, "padrao_suspenso", publicationId);
    });
  }
  async history(
    sessionId: string,
    catalogId: string,
    patternId: string,
    beforeId?: string,
  ): Promise<{ publications: readonly StructurePublication[]; nextCursor: string | null }> {
    return this.authorized(sessionId, catalogId, (tx, _ownerId, catalog) =>
      tx.publications(catalogId, patternId, catalog!.role !== "reader", beforeId),
    );
  }
  async compare(
    sessionId: string,
    catalogId: string,
    raw: unknown,
  ): Promise<{ beforeHash: string; afterHash: string; changes: readonly StructureChange[] }> {
    const input = z.strictObject({ beforeId: z.uuid(), afterId: z.uuid() }).parse(raw);
    return this.authorized(sessionId, catalogId, async (tx, _ownerId, catalog) => {
      const before = await tx.publication(catalogId, input.beforeId);
      const after = await tx.publication(catalogId, input.afterId);
      if (
        !before ||
        before.patternId !== after?.patternId ||
        (catalog!.role === "reader" && (before.suspendedAt || after.suspendedAt))
      ) {
        throw new PersonaV2Error("AUTHORIZATION_DENIED", "Versões indisponíveis para comparação.");
      }
      return {
        beforeHash: before.hash,
        afterHash: after.hash,
        changes: compareStructureContent(before.content, after.content),
      };
    });
  }
  private async requireDraft(
    tx: SharedKnowledgeTransaction,
    catalogId: string,
    patternId: string,
  ): Promise<StructureDraft> {
    const draft = await tx.draft(catalogId, patternId);
    if (!draft) {
      throw new PersonaV2Error("AUTHORIZATION_DENIED", "Padrão indisponível.");
    }
    return draft;
  }
}
