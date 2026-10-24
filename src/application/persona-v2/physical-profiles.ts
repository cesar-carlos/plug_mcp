import { z } from "zod";
import {
  knowledgeImpactQueryShape,
  validImpactFilter,
  impactResource,
} from "../../domain/persona-v2/knowledge-impact.js";
import type { PersonaServices, PersonaTransaction } from "../../domain/ports/persona-v2.port.js";
import type { SourceQueryGatewayPort } from "../../domain/ports/source-query.port.js";
import type {
  PhysicalProfile,
  PhysicalProfilePublication,
} from "../../domain/persona-v2/physical-profile.js";
import type {
  StructureContent,
  KnowledgeImpact,
} from "../../domain/persona-v2/shared-knowledge.js";
import { PersonaV2Error, type Source } from "../../domain/persona-v2/model.js";
import { canonicalJson } from "../../domain/persona-v2/catalog.js";
import { storedStructureEvidenceSchema } from "../../domain/persona-v2/source-schema.js";
import { validateStructureContent } from "./shared-structure-schema.js";
import { compareStructureEvidence } from "./structure-compatibility.js";
import type { PersonaAdministrativeAuthorization } from "./administrative-authorization.js";
import { pareceSegredoEmTexto } from "../../domain/entities/parece-segredo.js";
import { PhysicalKnowledgeAuthority } from "./physical-knowledge-authority.js";
import { publicationReview } from "./publication-review.js";
import { physicalProfileComparisonSchema } from "../../domain/persona-v2/physical-profile.js";
import {
  publicationReviewPlan,
  confirmPublicationReview,
  createPublicationCalendar,
} from "./review-publication.js";

const overridesSchema = z.strictObject({
  tables: z.array(z.string()).max(100),
  relationships: z.array(z.string()).max(200),
});
/** Full composed content, with reviewed explicit replacements. Security classifications only tighten. */
export function composePhysicalContent(
  base: StructureContent,
  content: StructureContent,
  overrides: PhysicalProfile["overrides"],
): void {
  if (base.system !== content.system || base.rules.some((r) => !content.rules.includes(r)))
    throw new PersonaV2Error("INVALID_PLAN", "Preserve sistema e restrições do padrão.");
  const rank = { livre: 0, inferido: 1, sensivel: 2, pessoal: 3, segredo: 4 };
  for (const kind of ["tables", "relationships"] as const) {
    if (
      new Set(overrides[kind]).size !== overrides[kind].length ||
      overrides[kind].some((id) => !base[kind].some((v) => v.id === id))
    )
      throw new PersonaV2Error(
        "INVALID_PLAN",
        "Substituição deve referenciar definição existente.",
      );
    for (const previous of base[kind]) {
      const next = content[kind].find((v) => v.id === previous.id);
      if (
        !next ||
        (canonicalJson(previous) !== canonicalJson(next) && !overrides[kind].includes(previous.id))
      )
        throw new PersonaV2Error(
          "INVALID_PLAN",
          "Conflito exige substituição explícita e revisão.",
        );
    }
  }
  for (const table of base.tables)
    for (const column of table.columns) {
      const next = content.tables
        .find((t) => t.id === table.id)
        ?.columns.find((c) => c.name === column.name);
      if (!next || rank[next.classification] < rank[column.classification])
        throw new PersonaV2Error(
          "INVALID_PLAN",
          "Particularidade não pode remover campo comum nem reduzir classificação.",
        );
    }
}
export function physicalProfileHash(
  p: PhysicalProfile,
  services: Pick<PersonaServices, "crypto">,
): string {
  return services.crypto.sha256Hex(canonicalJson(p));
}
export function publishedProfileHash(
  p: PhysicalProfilePublication,
  services: Pick<PersonaServices, "crypto">,
): string {
  const { publicationId: _id, hash: _hash, suspended: _suspended, ...draft } = p;
  return physicalProfileHash(draft, services);
}

export class PersonaPhysicalProfiles {
  constructor(
    private readonly s: PersonaServices,
    private readonly authority: PersonaAdministrativeAuthorization,
    private readonly gateway: SourceQueryGatewayPort,
  ) {}
  private async run<T>(
    sessionId: string,
    personaId: string,
    sourceId: string,
    catalogId: string,
    action: (
      tx: PersonaTransaction,
      source: Source,
      ownerId: string,
      catalogVersion: number,
    ) => Promise<T>,
    readOnly = false,
  ): Promise<T> {
    return new PhysicalKnowledgeAuthority(this.s, this.authority, this.gateway).run(
      sessionId,
      personaId,
      sourceId,
      catalogId,
      readOnly ? "reader" : "curator",
      (tx, source, owner, catalog) => action(tx, source, owner, catalog.authorizationVersion),
    );
  }
  async impact(
    sessionId: string,
    personaId: string,
    sourceId: string,
    raw: unknown,
  ): Promise<KnowledgeImpact> {
    const input = z
      .strictObject({ catalogId: z.uuid(), publicationId: z.uuid(), ...knowledgeImpactQueryShape })
      .refine(validImpactFilter, { message: "Selecione a tabela para filtrar uma coluna." })
      .parse(raw);
    return this.run(
      sessionId,
      personaId,
      sourceId,
      input.catalogId,
      async (tx, source, ownerId) => {
        const profile = await tx.profiles!.publication(input.catalogId, input.publicationId);
        if (
          profile?.physicalSourceId !== source.physicalSourceId ||
          profile.identityHash !== source.identityHash ||
          profile.hash !== publishedProfileHash(profile, this.s)
        )
          throw new PersonaV2Error("AUTHORIZATION_DENIED", "Perfil indisponível para esta base.");
        const base = await tx.knowledge!.publication(input.catalogId, profile.basePublicationId);
        if (base?.hash !== profile.baseHash)
          throw new PersonaV2Error("AUTHORIZATION_DENIED", "Padrão indisponível para este perfil.");
        return tx.knowledge!.impact(
          input.catalogId,
          input.publicationId,
          ownerId,
          input.after,
          "perfil",
          impactResource(input),
        );
      },
      true,
    );
  }
  async compare(
    sessionId: string,
    personaId: string,
    sourceId: string,
    raw: unknown,
  ): Promise<z.infer<typeof physicalProfileComparisonSchema>> {
    const input = z
      .strictObject({ catalogId: z.uuid(), beforeId: z.uuid(), afterId: z.uuid() })
      .parse(raw);
    return this.run(
      sessionId,
      personaId,
      sourceId,
      input.catalogId,
      async (tx, source) => {
        const before = await tx.profiles!.publication(input.catalogId, input.beforeId);
        const after = await tx.profiles!.publication(input.catalogId, input.afterId);
        for (const item of [before, after]) {
          if (
            item?.physicalSourceId !== source.physicalSourceId ||
            item.identityHash !== source.identityHash ||
            item.hash !== publishedProfileHash(item, this.s)
          )
            throw new PersonaV2Error(
              "AUTHORIZATION_DENIED",
              "Versões indisponíveis para esta base e catálogo.",
            );
          const base = await tx.knowledge!.publication(input.catalogId, item.basePublicationId);
          if (!base || base.suspendedAt || base.hash !== item.baseHash)
            throw new PersonaV2Error(
              "AUTHORIZATION_DENIED",
              "Padrão indisponível para comparação.",
            );
        }
        if (before!.id !== after!.id)
          throw new PersonaV2Error("INVALID_PLAN", "Selecione duas versões do mesmo perfil.");
        const draft = (p: PhysicalProfilePublication): PhysicalProfile => {
          const {
            publicationId: _publicationId,
            hash: _hash,
            suspended: _suspended,
            ...content
          } = p;
          return content;
        };
        return physicalProfileComparisonSchema.parse({
          before,
          after,
          sections: publicationReview(draft(before!), draft(after!)),
        });
      },
      true,
    );
  }
  async list(
    sessionId: string,
    personaId: string,
    sourceId: string,
    raw: unknown,
  ): ReturnType<NonNullable<PersonaTransaction["profiles"]>["list"]> {
    const input = z
      .strictObject({
        catalogId: z.uuid(),
        basePublicationId: z.uuid(),
        beforeDraft: z.uuid().optional(),
        beforePublication: z.uuid().optional(),
      })
      .parse(raw);
    return this.run(
      sessionId,
      personaId,
      sourceId,
      input.catalogId,
      async (tx, source, ownerId) => {
        const catalog = await tx.knowledge!.catalog(input.catalogId, ownerId);
        const base = await tx.knowledge!.publication(input.catalogId, input.basePublicationId);
        if (!base || base.suspendedAt)
          throw new PersonaV2Error("AUTHORIZATION_DENIED", "Padrão indisponível.");
        const includeDrafts = ["administrator", "curator"].includes(catalog!.role);
        if (!includeDrafts && input.beforeDraft)
          throw new PersonaV2Error("AUTHORIZATION_DENIED", "Rascunhos exigem curadoria.");
        return tx.profiles!.list({
          ...input,
          physicalSourceId: source.physicalSourceId,
          identityHash: source.identityHash!,
          includeDrafts,
        });
      },
      true,
    );
  }
  async save(
    sessionId: string,
    personaId: string,
    sourceId: string,
    raw: unknown,
  ): Promise<PhysicalProfile> {
    const input = z
      .strictObject({
        catalogId: z.uuid(),
        basePublicationId: z.uuid(),
        id: z.uuid().optional(),
        expectedRevision: z.number().int().positive().optional(),
        name: z.string().trim().min(1).max(200),
        content: z.unknown(),
        overrides: overridesSchema,
      })
      .parse(raw);
    const content = validateStructureContent(input.content, this.s.crypto);
    if (pareceSegredoEmTexto(input.name))
      throw new PersonaV2Error("INVALID_PLAN", "Nome contém segredo.");
    if (!!input.id !== !!input.expectedRevision)
      throw new PersonaV2Error("INVALID_PLAN", "Edição exige ID e revisão.");
    return this.run(
      sessionId,
      personaId,
      sourceId,
      input.catalogId,
      async (tx, source, ownerId) => {
        const base = await tx.knowledge!.publication(input.catalogId, input.basePublicationId);
        if (
          !base ||
          base.suspendedAt ||
          base.hash !== this.s.crypto.sha256Hex(canonicalJson(base.content))
        )
          throw new PersonaV2Error("AUTHORIZATION_DENIED", "Padrão indisponível.");
        const old = input.id ? await tx.profiles!.get(input.catalogId, input.id) : null;
        if (
          input.id &&
          (!old ||
            old.revision !== input.expectedRevision ||
            old.physicalSourceId !== source.physicalSourceId ||
            old.identityHash !== source.identityHash ||
            old.basePublicationId !== base.id)
        )
          throw new PersonaV2Error(
            "OPERATION_CONFLICT",
            "Perfil, identidade ou revisão divergente.",
          );
        composePhysicalContent(base.content, content, input.overrides);
        const profile: PhysicalProfile = {
          id: input.id ?? this.s.crypto.randomId(),
          catalogId: input.catalogId,
          physicalSourceId: source.physicalSourceId,
          identityHash: source.identityHash!,
          basePublicationId: base.id,
          baseHash: base.hash,
          name: input.name,
          revision: (old?.revision ?? 0) + 1,
          content,
          overrides: input.overrides,
        };
        await tx.profiles!.save(profile, input.expectedRevision ?? null);
        await tx.knowledge!.audit(input.catalogId, ownerId, "perfil_fisico_rascunho", profile.id);
        return profile;
      },
    );
  }
  async review(
    sessionId: string,
    personaId: string,
    sourceId: string,
    raw: unknown,
    publish: boolean,
  ): Promise<
    | {
        profile: PhysicalProfile;
        hash: string;
        confirmationHash: string;
        expiresAt: string;
        reviewDueAt: string;
      }
    | PhysicalProfilePublication
  > {
    const input = z
      .strictObject({
        catalogId: z.uuid(),
        profileId: z.uuid(),
        evidenceId: z.uuid(),
        reviewDueAt: z.iso.datetime().optional(),
        confirmationHash: z
          .string()
          .regex(/^[a-f0-9]{64}$/)
          .optional(),
      })
      .parse(raw);
    return this.run(
      sessionId,
      personaId,
      sourceId,
      input.catalogId,
      async (tx, source, ownerId, version) => {
        const profile = await tx.profiles!.get(input.catalogId, input.profileId);
        const base = profile
          ? await tx.knowledge!.publication(input.catalogId, profile.basePublicationId)
          : null;
        const stored = await tx.structureEvidence(personaId, input.evidenceId);
        if (
          profile?.physicalSourceId !== source.physicalSourceId ||
          profile.identityHash !== source.identityHash ||
          !base ||
          base.suspendedAt ||
          base.hash !== profile.baseHash ||
          stored?.sourceId !== source.id ||
          stored.sourceVersion !== source.authorizationVersion ||
          stored.credentialVersion !== source.credentialVersion ||
          stored.identityHash !== source.identityHash ||
          stored.expiresAt <= this.s.now() ||
          stored.hash !== this.s.crypto.sha256Hex(canonicalJson(stored.evidence))
        )
          throw new PersonaV2Error(
            "STALE_AUTHORIZATION",
            "Perfil ou prova obsoletos; revise a mesma base.",
          );
        if (profile.content.examples.some((e) => e.state === "candidate"))
          throw new PersonaV2Error(
            "INCOMPLETE_INPUT",
            "Revise os exemplos candidatos antes de publicar o perfil.",
          );
        if (
          compareStructureEvidence(
            profile.content,
            storedStructureEvidenceSchema.parse(stored.evidence),
          ).status !== "compatible"
        )
          throw new PersonaV2Error("INCOMPLETE_INPUT", "Estrutura do perfil não comprovada.");
        const hash = physicalProfileHash(profile, this.s);
        if (!publish) {
          const plan = await publicationReviewPlan(
            tx.knowledgeMaintenance,
            {
              kind: "perfil",
              draftId: profile.id,
              personaId: null,
              catalogId: input.catalogId,
              revision: profile.revision,
              hash,
            },
            ownerId,
            this.s.now(),
            input.reviewDueAt,
          );
          const confirmationHash = this.s.crypto.sha256Hex(this.s.crypto.randomId());
          const expiresAt = new Date(this.s.now().getTime() + 900000);
          await tx.profiles!.preview({
            hash: confirmationHash,
            profile,
            ownerId,
            catalogVersion: version,
            evidenceId: input.evidenceId,
            evidenceHash: stored.hash,
            expiresAt,
          });
          await tx.knowledgeMaintenance!.bindReviewPlan(confirmationHash, plan);
          return {
            profile,
            hash,
            confirmationHash,
            expiresAt: expiresAt.toISOString(),
            reviewDueAt: plan.dueAt,
          };
        }
        if (
          !input.confirmationHash ||
          !(await tx.profiles!.consume(
            input.confirmationHash,
            profile,
            ownerId,
            version,
            input.evidenceId,
            stored.hash,
            this.s.now(),
          ))
        )
          throw new PersonaV2Error(
            "OPERATION_CONFLICT",
            "Revisão expirada, alterada ou já utilizada.",
          );
        const publication = {
          ...profile,
          publicationId: this.s.crypto.randomId(),
          hash,
          suspended: false,
        };
        await tx.profiles!.publish(publication);
        const plan = await confirmPublicationReview(
          tx.knowledgeMaintenance,
          {
            kind: "perfil",
            draftId: profile.id,
            personaId: null,
            catalogId: input.catalogId,
            revision: profile.revision,
            hash,
          },
          input.confirmationHash,
          this.s.now(),
        );
        if (input.reviewDueAt !== undefined && input.reviewDueAt !== plan.dueAt) {
          throw new PersonaV2Error("OPERATION_CONFLICT", "Prazo difere da prévia confirmada.");
        }
        await createPublicationCalendar(
          tx.knowledgeMaintenance!,
          {
            kind: "perfil",
            publicationId: publication.publicationId,
            hash,
            personaId: null,
            catalogId: input.catalogId,
          },
          plan,
          this.s.now(),
        );
        await tx.knowledge!.audit(
          input.catalogId,
          ownerId,
          "perfil_fisico_publicado",
          publication.publicationId,
        );
        return publication;
      },
    );
  }
  async suspend(
    sessionId: string,
    personaId: string,
    sourceId: string,
    raw: unknown,
  ): Promise<void> {
    const input = z.strictObject({ catalogId: z.uuid(), publicationId: z.uuid() }).parse(raw);
    await this.run(sessionId, personaId, sourceId, input.catalogId, async (tx, source, ownerId) => {
      const pub = await tx.profiles!.publication(input.catalogId, input.publicationId);
      if (
        pub?.physicalSourceId !== source.physicalSourceId ||
        pub.identityHash !== source.identityHash
      )
        throw new PersonaV2Error("AUTHORIZATION_DENIED", "Perfil indisponível nesta base.");
      await tx.profiles!.suspend(input.catalogId, pub.publicationId, ownerId);
      await tx.knowledge!.audit(
        input.catalogId,
        ownerId,
        "perfil_fisico_suspenso",
        pub.publicationId,
      );
    });
  }
}
