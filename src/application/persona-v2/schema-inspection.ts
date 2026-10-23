import type { PersonaServices, PersonaTransaction } from "../../domain/ports/persona-v2.port.js";
import type { SourceQueryGatewayPort } from "../../domain/ports/source-query.port.js";
import type {
  AdministrativeActor,
  AdministrativeContext,
  PersonaAdministrativeAuthorization,
} from "./administrative-authorization.js";
import {
  schemaInspectionSchema,
  sourceSchemaResultSchema,
  storedStructureEvidenceSchema,
  composeStructureEvidenceSchema,
  type SourceSchemaEvidence,
  type StoredStructureEvidence,
} from "../../domain/persona-v2/source-schema.js";
import { PersonaV2Error } from "../../domain/persona-v2/model.js";
import { canonicalJson } from "../../domain/persona-v2/catalog.js";
import { sourceIdentityMatches } from "../../domain/persona-v2/source-discovery.js";
import type { SharedKnowledge } from "./shared-knowledge.js";
import { compareStructureEvidence, type StructureComparison } from "./structure-compatibility.js";
import { publishedProfileHash } from "./physical-profiles.js";
import { composeStructureEvidence, type EvidencePage } from "./structure-evidence-composition.js";
export type StructureCompositionResult =
  | { status: "inconclusive"; issues: string[]; executable: false; semanticApproval: false }
  | {
      status: "composed";
      id: string;
      hash: string;
      sourceId: string;
      evidence: StoredStructureEvidence;
      expiresAt: string;
      executable: false;
      semanticApproval: false;
    };

/** Observes structural facts only. It never adopts a pattern, publishes training or grants SQL. */
export class PersonaSchemaInspection {
  constructor(
    private readonly s: PersonaServices,
    private readonly authority: PersonaAdministrativeAuthorization,
    private readonly gateway: SourceQueryGatewayPort,
  ) {}
  async compare(
    sessionId: string,
    personaId: string,
    sourceId: string,
    evidenceId: string,
    catalogId: string,
    publicationId: string,
    knowledge: SharedKnowledge,
    profilePublicationId?: string,
    selectedTables?: readonly { id: string; columns: readonly string[] }[],
  ): Promise<
    StructureComparison & {
      publicationId: string;
      publicationHash: string;
      evidenceId: string;
      profilePublicationId?: string;
      profileHash?: string;
    }
  > {
    const publication = await knowledge.publication(sessionId, catalogId, publicationId);
    if (publication.suspendedAt)
      throw new PersonaV2Error("AUTHORIZATION_DENIED", "Versão compartilhada suspensa.");
    let sourceFingerprint = "";
    const result = await this.authority.run(
      sessionId,
      personaId,
      "treinar",
      async (tx, context) => {
        const source = (await tx.listSources(personaId)).find((s) => s.id === sourceId && s.active);
        const stored = await tx.structureEvidence(personaId, evidenceId);
        if (
          !source ||
          stored?.sourceId !== sourceId ||
          stored.sourceVersion !== source.authorizationVersion ||
          stored.credentialVersion !== source.credentialVersion ||
          stored.identityHash !== source.identityHash ||
          stored.expiresAt <= this.s.now() ||
          stored.hash !== this.s.crypto.sha256Hex(canonicalJson(stored.evidence))
        )
          throw new PersonaV2Error(
            "STALE_AUTHORIZATION",
            "Inspeção ausente, alterada ou expirada; inspecione novamente.",
          );
        if (!(await tx.knowledge?.catalog(catalogId, context.ownerId)))
          throw new PersonaV2Error("AUTHORIZATION_DENIED", "Catálogo indisponível.");
        sourceFingerprint = canonicalJson(source);
        const profile = profilePublicationId
          ? await tx.profiles?.publication(catalogId, profilePublicationId)
          : undefined;
        if (
          profilePublicationId &&
          (!profile ||
            profile.suspended ||
            profile.physicalSourceId !== source.physicalSourceId ||
            profile.identityHash !== source.identityHash ||
            profile.basePublicationId !== publication.id ||
            profile.baseHash !== publication.hash ||
            publishedProfileHash(profile, this.s) !== profile.hash)
        )
          throw new PersonaV2Error(
            "AUTHORIZATION_DENIED",
            "Perfil indisponível nesta base e versão do padrão.",
          );
        const content = profile?.content ?? publication.content;
        const tables = selectedTables
          ? selectedTables.map((selection) => {
              const table = content.tables.find((t) => t.id === selection.id);
              if (
                !table ||
                selection.columns.some((name) => !table.columns.some((c) => c.name === name))
              )
                throw new PersonaV2Error(
                  "INVALID_PLAN",
                  "Seleção não pertence à versão publicada.",
                );
              return {
                ...table,
                columns: table.columns.filter((c) => selection.columns.includes(c.name)),
                keys: table.keys?.filter((k) =>
                  k.columns.every((c) => selection.columns.includes(c)),
                ),
              };
            })
          : content.tables;
        const dependencies = {
          ...content,
          tables,
          relationships: content.relationships.filter(
            (r) => tables.some((t) => t.id === r.from) && tables.some((t) => t.id === r.to),
          ),
        };
        return {
          ...compareStructureEvidence(
            dependencies,
            storedStructureEvidenceSchema.parse(stored.evidence),
          ),
          ...(profile
            ? { profilePublicationId: profile.publicationId, profileHash: profile.hash }
            : {}),
        };
      },
    );
    const current = await knowledge.publication(sessionId, catalogId, publicationId);
    if (current.suspendedAt || current.hash !== publication.hash)
      throw new PersonaV2Error("STALE_AUTHORIZATION", "Conhecimento mudou durante a comparação.");
    await this.authority.run(sessionId, personaId, "treinar", async (tx, context) => {
      const catalog = await tx.knowledge?.catalog(catalogId, context.ownerId);
      const source = (await tx.listSources(personaId)).find((s) => s.id === sourceId);
      const stored = await tx.structureEvidence(personaId, evidenceId);
      const profile = profilePublicationId
        ? await tx.profiles?.publication(catalogId, profilePublicationId)
        : undefined;
      if (
        !catalog ||
        canonicalJson(source) !== sourceFingerprint ||
        !stored ||
        stored.expiresAt <= this.s.now() ||
        (profilePublicationId &&
          (!profile || profile.suspended || profile.hash !== result.profileHash))
      )
        throw new PersonaV2Error(
          "STALE_AUTHORIZATION",
          "Fonte, evidência, perfil ou catálogo mudou durante a comparação.",
        );
    });
    return { ...result, publicationId, publicationHash: publication.hash, evidenceId };
  }
  async compose(
    actor: AdministrativeActor,
    personaId: string,
    sourceId: string,
    raw: unknown,
  ): Promise<StructureCompositionResult> {
    const { evidenceIds } = composeStructureEvidenceSchema.parse(raw);
    const load = async (tx: PersonaTransaction, context: AdministrativeContext) => {
      if (
        context.state &&
        ![
          context.state.token.permissions,
          ...(context.state.grant ? [context.state.grant.permissions] : []),
        ].every((p) => p.sourceIds.includes(sourceId))
      ) {
        throw new PersonaV2Error("AUTHORIZATION_DENIED", "Fonte não concedida para inspeção.");
      }
      const source = (await tx.listSources(personaId)).find((s) => s.id === sourceId && s.active);
      if (!source) throw new PersonaV2Error("AUTHORIZATION_DENIED", "Fonte indisponível.");
      const pages: EvidencePage[] = [];
      for (const id of evidenceIds) {
        const page = await tx.structureEvidence(personaId, id);
        if (
          page?.sourceId !== sourceId ||
          page.sourceVersion !== source.authorizationVersion ||
          page.credentialVersion !== source.credentialVersion ||
          page.identityHash !== source.identityHash ||
          page.expiresAt <= this.s.now() ||
          !sourceIdentityMatches(source, page.evidence.identity) ||
          page.hash !== this.s.crypto.sha256Hex(canonicalJson(page.evidence))
        ) {
          throw new PersonaV2Error(
            "STALE_AUTHORIZATION",
            "Página indisponível, alterada ou expirada; inspecione novamente.",
          );
        }
        pages.push({ ...page, id });
      }
      return { source, pages };
    };
    const first = await this.authority.run(actor, personaId, "treinar", load);
    const combined = composeStructureEvidence(first.pages, this.s.crypto);
    if (combined.status === "inconclusive") {
      return { ...combined, executable: false as const, semanticApproval: false as const };
    }
    const lease = await this.gateway.authorize(
      first.source,
      combined.scope.resources.map((r) => ({
        name: r.schema ? `${r.schema}.${r.name}` : r.name,
        type: r.type,
      })),
      { exactResources: true, requireDatabase: true, requireSchema: true },
    );
    if (!lease.inspectSchema) {
      throw new PersonaV2Error("CAPABILITY_UNAVAILABLE", "Inspeção estrutural não disponível.");
    }
    await lease.revalidate();
    const id = this.s.crypto.randomId(),
      hash = this.s.crypto.sha256Hex(canonicalJson(combined.evidence));
    await this.authority.run(actor, personaId, "treinar", async (tx, context) => {
      const current = await load(tx, context);
      if (
        canonicalJson(current.source) !== canonicalJson(first.source) ||
        canonicalJson(current.pages) !== canonicalJson(first.pages)
      ) {
        throw new PersonaV2Error(
          "STALE_AUTHORIZATION",
          "Fonte ou páginas mudaram durante a composição.",
        );
      }
      await tx.recordStructureEvidence({
        id,
        hash,
        source: current.source,
        scope: combined.scope,
        evidence: combined.evidence,
        expiresAt: combined.expiresAt,
      });
    });
    return {
      status: "composed" as const,
      id,
      hash,
      sourceId,
      evidence: combined.evidence,
      expiresAt: combined.expiresAt.toISOString(),
      executable: false as const,
      semanticApproval: false as const,
    };
  }
  async inspect(
    actor: AdministrativeActor,
    personaId: string,
    sourceId: string,
    raw: unknown,
  ): Promise<{
    id: string;
    hash: string;
    expiresAt: string;
    sourceId: string;
    evidence: SourceSchemaEvidence;
    executable: false;
    semanticApproval: false;
  }> {
    const input = schemaInspectionSchema.parse(raw);
    const source = await this.authority.run(actor, personaId, "treinar", async (tx, context) => {
      if (
        context.state &&
        ![
          context.state.token.permissions,
          ...(context.state.grant ? [context.state.grant.permissions] : []),
        ].every((p) => p.sourceIds.includes(sourceId))
      )
        throw new PersonaV2Error("AUTHORIZATION_DENIED", "Fonte não concedida para inspeção.");
      const source = (await tx.listSources(personaId)).find((s) => s.id === sourceId && s.active);
      if (!source) throw new PersonaV2Error("AUTHORIZATION_DENIED", "Fonte indisponível.");
      return source;
    });
    if (input.offset >= input.resources.length || input.resources.some((r) => r.schema === null))
      throw new PersonaV2Error(
        "INVALID_PLAN",
        "Informe schemas exatos e uma página válida para o motor.",
      );
    const lease = await this.gateway.authorize(
      source,
      input.resources.map((r) => ({
        name: r.schema ? `${r.schema}.${r.name}` : r.name,
        type: r.type,
      })),
      { exactResources: true, requireDatabase: true },
    );
    if (!lease.inspectSchema)
      throw new PersonaV2Error("CAPABILITY_UNAVAILABLE", "Inspeção estrutural não disponível.");
    const evidence = sourceSchemaResultSchema.parse(await lease.inspectSchema(input));
    if (
      !sourceIdentityMatches(source, evidence.identity) ||
      canonicalJson(evidence.resources.map((r) => r.resource)) !==
        canonicalJson(input.resources.slice(input.offset, input.offset + input.pageSize)) ||
      evidence.metadataPage.offset !== input.offset ||
      evidence.metadataPage.pageSize !== input.pageSize ||
      evidence.metadataPage.nextOffset !==
        (input.offset + evidence.resources.length < input.resources.length
          ? input.offset + evidence.resources.length
          : null)
    )
      throw new PersonaV2Error(
        "STALE_AUTHORIZATION",
        "Prova estrutural não corresponde ao escopo solicitado.",
      );
    const id = this.s.crypto.randomId(),
      hash = this.s.crypto.sha256Hex(canonicalJson(evidence)),
      expiresAt = new Date(this.s.now().getTime() + 900000);
    await lease.revalidate();
    await this.authority.run(actor, personaId, "treinar", async (tx, context) => {
      const current = (await tx.listSources(personaId)).find((s) => s.id === sourceId);
      if (
        canonicalJson(current) !== canonicalJson(source) ||
        (context.state &&
          ![
            context.state.token.permissions,
            ...(context.state.grant ? [context.state.grant.permissions] : []),
          ].every((p) => p.sourceIds.includes(sourceId)))
      )
        throw new PersonaV2Error(
          "STALE_AUTHORIZATION",
          "Fonte ou concessão mudou durante a inspeção.",
        );
      await tx.recordStructureEvidence({ id, source, scope: input, evidence, hash, expiresAt });
    });
    return {
      id,
      hash,
      expiresAt: expiresAt.toISOString(),
      sourceId,
      evidence,
      executable: false,
      semanticApproval: false,
    };
  }
}
