import type { PersonaServices, PersonaTransaction } from "../../domain/ports/persona-v2.port.js";
import type { PhysicalQueryFence } from "../../domain/ports/persona-query-reuse.port.js";
import {
  PersonaV2Error,
  type ConsumerIdentity,
  type AuthorizationSnapshot,
  type Persona,
  type Source,
} from "../../domain/persona-v2/model.js";
import { assertConsumer, authorizePublication } from "../../domain/persona-v2/authorization.js";
import {
  canonicalJson,
  type CatalogPublication,
  type QueryPackage,
  type PublishedPackage,
  type FederationPackage,
  type SkillDraft,
} from "../../domain/persona-v2/catalog.js";
import { queryTrainingSchema, sourceFingerprint, type QueryTraining } from "./query-training.js";
import { parseSourceRestrictions } from "./source-restrictions.js";
import type { FederationBudget } from "../../domain/persona-v2/federation.js";
import type { ConsumerDiagnosis, SkillDiagnosis } from "../../domain/persona-v2/console.js";
import { authorizeOperationPublication } from "./operation-authority.js";
import { sharedQueryKnowledgeCurrent } from "./shared-query-adoption.js";
import { sharedOperationKnowledgeCurrent } from "./shared-operation-adoption.js";
import { publicationKnowledgeDocuments, normalizeKnowledgeText } from "./knowledge-documents.js";
import { knowledgeSearchTerms, matchingKnowledgeTerms } from "./knowledge-search.js";
import {
  queryKnowledgeGraph,
  operationKnowledgeGraph,
  knowledgeEdgesWithExposedPaths,
} from "./knowledge-graph.js";
import {
  knowledgeGraphInputSchema,
  KNOWLEDGE_SEARCH_MAX_RESULTS,
  KNOWLEDGE_SEARCH_MAX_TERMS,
  type KnowledgeDocument,
  type KnowledgeGraph,
  type KnowledgeGraphInput,
} from "../../domain/persona-v2/knowledge-context.js";
import type { StructureContent } from "../../domain/persona-v2/shared-knowledge.js";
import { z } from "zod";
import type { QueryLimits } from "../../domain/persona-v2/execution-limits.js";
import {
  consumerQueryLimits,
  consumerFederationLimits,
  consumerOperationLimits,
} from "./execution-budgets.js";

export interface PublishedSkillSummary {
  id: string;
  slug: string;
  name: string;
  kind: string;
  publicationId: string;
  hash: string;
  sourceId?: string;
  sourceIds?: readonly string[];
  purpose: string;
}
export const knowledgeHistorySchema = z.strictObject({
  skillId: z.uuid(),
  afterSkillId: z.uuid().optional(),
});
export const knowledgeComparisonSchema = z.strictObject({
  fromSkillId: z.uuid(),
  toSkillId: z.uuid(),
});
interface KnowledgeComparisonReference {
  skillId: string;
  skillPublicationId: string;
  sourceId: string;
  publicationId: string;
  hash: string;
  profilePublicationId: string | null;
  profileHash: string | null;
}
export interface KnowledgeComparison {
  from: KnowledgeComparisonReference;
  to: KnowledgeComparisonReference;
  changes: {
    section: keyof StructureContent;
    before: StructureContent[keyof StructureContent];
    after: StructureContent[keyof StructureContent];
  }[];
  scope: "granted_adopted_sql_snapshots";
  catalogBrowsing: false;
  grantsExecution: false;
}
export interface AuthorizedKnowledgeVersion {
  skillId: string;
  skillPublicationId: string;
  sourceId: string;
  publicationId: string;
  hash: string;
  revision: number;
  publishedAt: string;
  profilePublicationId?: string;
  profileHash?: string;
}
export interface PublishedQueryContext {
  limits: QueryLimits;
  sharedKnowledge?: QueryPackage["sharedKnowledge"];
  commonTraining: QueryPackage["commonTraining"];
  id: string;
  publicationId: string;
  hash: string;
  sourceId: string;
  dialect: Source["dialect"];
  purpose: string;
  sqlModel: string;
  examples: NonNullable<QueryTraining["examples"]>;
  scope: QueryPackage["scope"];
  parameters: QueryTraining["parameters"];
  rules: QueryTraining["rules"];
  tables: QueryTraining["tables"];
  relationships: QueryTraining["relationships"];
  columns: QueryTraining["columns"];
  requiredFilters: readonly { table: string; column: string; parameter: string }[];
}

/** Internal authorization evidence. Credentials never enter the consumer response. */
export interface AuthorizedSourceQuery {
  consumerExpiresAt?: number;
  cacheFence?: PhysicalQueryFence;
  executionLimits: QueryLimits;
  source: Source;
  publications: readonly CatalogPublication[];
}

export class PersonaConsumerCatalog {
  constructor(private readonly services: PersonaServices) {}

  /** Feedback binds to an exact visible item; editorial writes reuse read authorization. */
  withKnowledge<T>(
    identity: ConsumerIdentity,
    skillId: string,
    publicationId: string | null,
    action: (
      tx: PersonaTransaction,
      publication: CatalogPublication<PublishedPackage>,
      documents: readonly KnowledgeDocument[],
    ) => Promise<T>,
  ): Promise<T> {
    return this.authorized(identity, async (tx, state) => {
      const skill = await tx.catalog.find(identity.personaId, skillId);
      const publication = skill?.activePublicationId
        ? await tx.catalog.publication(identity.personaId, skill.activePublicationId)
        : null;
      if (publication) await this.lockPublishedKnowledge(tx, state.persona.ownerId, [publication]);
      if (
        !publication ||
        (publicationId && publication.id !== publicationId) ||
        !(await this.visibleAll(tx, identity, state, publication))
      )
        throw new PersonaV2Error(
          "AUTHORIZATION_DENIED",
          "Conhecimento indisponível para este consumidor.",
        );
      return action(tx, publication, await this.indexedKnowledge(tx, publication));
    });
  }

  /** Local diagnosis reuses visibility gates; a positive result never reserves remote authority. */
  async diagnose(identity: ConsumerIdentity): Promise<ConsumerDiagnosis> {
    return this.authorized(identity, async (tx, state) => {
      const skills = await this.diagnoseInTransaction(tx, identity, state);
      await tx.recordConsumerConnection(identity);
      return {
        personaId: state.persona.id,
        checkedAt: this.services.now().toISOString(),
        token: {
          id: state.token.id,
          version: state.token.authorizationVersion,
          expiresAt: state.token.expiresAt,
          state: "vigente" as const,
        },
        remoteAuthority: "nao_verificado" as const,
        sqlExecuted: false as const,
        skills,
        guidance:
          "Diagnóstico local. JWT Client, vínculo, policy, identidade e recursos são revalidados no envio e na entrega. Teste a fonte para conferir os portões remotos; isso não valida o SQL.",
      };
    });
  }

  async diagnoseInTransaction(
    tx: PersonaTransaction,
    identity: ConsumerIdentity,
    state: AuthorizationSnapshot,
  ): Promise<readonly SkillDiagnosis[]> {
    const layers = assertConsumer(identity, state, this.services.now());
    const items: SkillDiagnosis[] = [];
    for (const grant of layers[0]!.skills) {
      if (!layers.every((layer) => layer.skills.some((g) => g.skillId === grant.skillId))) continue;
      const draft = await tx.catalog.find(identity.personaId, grant.skillId);
      const publication = draft?.activePublicationId
        ? await tx.catalog.publication(identity.personaId, draft.activePublicationId)
        : null;
      const visible = publication && (await this.visibleAll(tx, identity, state, publication));
      if (!visible || !publication) {
        items.push({
          skillId: grant.skillId,
          state: "bloqueado" as const,
          code: "PUBLICACAO_OU_DEPENDENCIA_INDISPONIVEL",
          reason: "A concessão não cobre uma publicação utilizável e todas as suas dependências.",
          action: "Solicite ao responsável a revisão da publicação, fontes e concessões.",
        });
        continue;
      }
      const pkg = publication.package;
      const requiredApproval =
        (pkg.format === "persona-sql-operation-v2" && pkg.training.approval === "human") ||
        layers.some(
          (layer) => layer.skills.find((g) => g.skillId === grant.skillId)?.requireHumanApproval,
        );
      items.push({
        skillId: grant.skillId,
        name: pkg.name,
        publicationId: publication.id,
        revision: publication.revision,
        kind: draft!.kind,
        state: "permitido" as const,
        code: "CONCESSAO_LOCAL_VIGENTE",
        reason: "Publicação e dependências cobertas pela concessão local.",
        action: "Confira os portões remotos antes de consultar.",
        requireHumanApproval: requiredApproval,
        capabilities: pkg.requiredCapabilities,
        sourceIds:
          pkg.format === "persona-federation-v2"
            ? [...new Set(pkg.dependencies.map((d) => d.sourceId))]
            : [pkg.sourceId],
        limits:
          pkg.format === "persona-federation-v2"
            ? consumerFederationLimits(
                identity,
                state,
                publication.skillId,
                pkg.budget,
                this.services.now(),
              )
            : pkg.format === "persona-query-v2"
              ? consumerQueryLimits(
                  identity,
                  state,
                  [{ ...publication, package: pkg }],
                  this.services.now(),
                )
              : consumerOperationLimits(
                  identity,
                  state,
                  publication.skillId,
                  pkg.training,
                  this.services.now(),
                ),
      });
    }
    return items;
  }

  async authenticate(bearer: string): Promise<ConsumerIdentity> {
    const state = await this.services.repository.authentication(
      this.services.crypto.sha256Hex(bearer),
    );
    if (!state) throw new PersonaV2Error("AUTHORIZATION_DENIED", "Token inválido.");
    const identity = {
      personaId: state.persona.id,
      tokenId: state.token.id,
      personaVersion: state.persona.authorizationVersion,
      tokenVersion: state.token.authorizationVersion,
    };
    assertConsumer(identity, state, this.services.now());
    return identity;
  }

  private async authorized<T>(
    identity: ConsumerIdentity,
    action: (tx: PersonaTransaction, state: AuthorizationSnapshot) => Promise<T>,
  ): Promise<T> {
    return this.services.repository.transaction(
      { personaIds: [identity.personaId], tokenIds: [identity.tokenId] },
      async (tx) => {
        const state = await tx.authorization(identity);
        if (!state) throw new PersonaV2Error("AUTHORIZATION_DENIED", "Consumidor indisponível.");
        assertConsumer(identity, state, this.services.now());
        const value = await action(tx, state);
        // In the same transaction/locks used by manual and OAuth revocation.
        assertConsumer(identity, state, this.services.now());
        return value;
      },
    );
  }

  async persona(
    identity: ConsumerIdentity,
  ): Promise<Pick<Persona, "id" | "name" | "specialty" | "instructions">> {
    return this.authorized(identity, (_tx, state) =>
      Promise.resolve({
        id: state.persona.id,
        name: state.persona.name,
        specialty: state.persona.specialty,
        instructions: state.persona.instructions,
      }),
    );
  }

  async sources(
    identity: ConsumerIdentity,
  ): Promise<readonly Pick<Source, "id" | "name" | "purpose" | "environment" | "dialect">[]> {
    return this.authorized(identity, (_tx, state) => {
      const layers = assertConsumer(identity, state, this.services.now());
      return Promise.resolve(
        state.sources
          .filter((s) => s.active && layers.every((p) => p.sourceIds.includes(s.id)))
          .map((s) => ({
            id: s.id,
            name: s.name,
            purpose: s.purpose,
            environment: s.environment,
            dialect: s.dialect,
          })),
      );
    });
  }

  /** Lexical discovery of granted publications; a match is never execution authority. */
  async search(identity: ConsumerIdentity, question: string): Promise<unknown> {
    const terms = knowledgeSearchTerms(question, KNOWLEDGE_SEARCH_MAX_TERMS);
    return this.authorized(identity, async (tx, state) => {
      const matches = [];
      const layers = assertConsumer(identity, state, this.services.now());
      const candidates: { skill: SkillDraft; publication: CatalogPublication<PublishedPackage> }[] =
        [];
      for (const skill of await tx.catalog.list(identity.personaId)) {
        if (
          !skill.activePublicationId ||
          !layers.every((p) => p.skills.some((g) => g.skillId === skill.id))
        )
          continue;
        const publication = await tx.catalog.publication(
          identity.personaId,
          skill.activePublicationId,
        );
        if (publication) candidates.push({ skill, publication });
      }
      await this.lockPublishedKnowledge(
        tx,
        state.persona.ownerId,
        candidates.map((c) => c.publication),
      );
      for (const { skill, publication } of candidates) {
        if (!(await this.visibleAll(tx, identity, state, publication))) continue;
        const pkg = publication.package;
        const sourceIds =
          pkg.format === "persona-federation-v2"
            ? [...new Set(pkg.dependencies.map((d) => d.sourceId))]
            : [pkg.sourceId];
        const text = normalizeKnowledgeText(
          [
            skill.slug,
            pkg.name,
            pkg.purpose,
            ...state.sources
              .filter((s) => sourceIds.includes(s.id))
              .flatMap((s) => [s.name, s.purpose]),
          ].join(" "),
        );
        // Visibility is checked before reading/building an index, even on an index hit.
        const documents = await this.indexedKnowledge(tx, publication);
        const itemMatches = documents
          .map(({ text: content, ...item }) => ({
            ...item,
            matchedTerms: matchingKnowledgeTerms(content, terms),
          }))
          .filter((item) => item.matchedTerms.length);
        const matchedTerms = terms.filter(
          (term) =>
            text.includes(term) || itemMatches.some((item) => item.matchedTerms.includes(term)),
        );
        if (!matchedTerms.length) continue;
        matches.push({
          skillId: skill.id,
          slug: skill.slug,
          name: pkg.name,
          purpose: pkg.purpose,
          kind: skill.kind,
          sourceIds,
          publicationId: publication.id,
          hash: publication.hash,
          matchedTerms,
          score: matchedTerms.length,
          items: itemMatches.slice(0, KNOWLEDGE_SEARCH_MAX_RESULTS),
          itemsComplete: itemMatches.length <= KNOWLEDGE_SEARCH_MAX_RESULTS,
        });
      }
      matches.sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug));
      return {
        method: "lexical",
        semanticApproval: false,
        matches: matches.slice(0, KNOWLEDGE_SEARCH_MAX_RESULTS),
        complete: matches.length <= KNOWLEDGE_SEARCH_MAX_RESULTS,
        guidance:
          "Leia obter_skill e confirme a finalidade e as fontes antes de consultar. Correspondência lexical não comprova cobertura. Se não houver candidato, confira listar_skills; não invente estrutura ou resposta.",
      };
    });
  }

  /** Shared locks serialize with catalog/profile revocation, in stable order across personas. */
  private async lockPublishedKnowledge(
    tx: PersonaTransaction,
    ownerId: string,
    publications: readonly CatalogPublication<PublishedPackage>[],
  ): Promise<void> {
    const catalogIds = new Set<string>(),
      seen = new Set<string>(),
      pending = [...publications];
    while (pending.length) {
      const publication = pending.pop()!;
      if (seen.has(publication.id)) continue;
      seen.add(publication.id);
      const pkg = publication.package;
      if (pkg.format !== "persona-federation-v2" && pkg.sharedKnowledge)
        catalogIds.add(pkg.sharedKnowledge.catalogId);
      if (pkg.format === "persona-federation-v2") {
        for (const dep of pkg.dependencies) {
          const current = await tx.catalog.publication(publication.personaId, dep.publicationId);
          if (current) pending.push(current);
        }
      }
    }
    if (catalogIds.size) {
      if (!tx.knowledge)
        throw new PersonaV2Error("CAPABILITY_UNAVAILABLE", "Conhecimento indisponível.");
      for (const id of [...catalogIds].sort()) await tx.knowledge.catalog(id, ownerId);
    }
  }

  private async knowledgeBase(
    tx: PersonaTransaction,
    publication: CatalogPublication<PublishedPackage>,
  ): Promise<StructureContent | undefined> {
    if (publication.package.format !== "persona-query-v2" || !publication.package.sharedKnowledge) {
      return undefined;
    }
    const ref = publication.package.sharedKnowledge;
    const base = await tx.knowledge?.publication(ref.catalogId, ref.publicationId);
    if (
      base?.hash !== ref.publicationHash ||
      base.suspendedAt ||
      this.services.crypto.sha256Hex(canonicalJson(base.content)) !== base.hash
    ) {
      throw new PersonaV2Error("AUTHORIZATION_DENIED", "Conhecimento publicado indisponível.");
    }
    return base.content;
  }

  private async indexedKnowledge(
    tx: PersonaTransaction,
    publication: CatalogPublication<PublishedPackage>,
  ): Promise<readonly KnowledgeDocument[]> {
    const stored = await tx.knowledgeIndex.get(
      publication.personaId,
      publication.id,
      publication.hash,
    );
    if (stored) {
      if (this.services.crypto.sha256Hex(canonicalJson(stored.documents)) === stored.hash) {
        return stored.documents;
      }
    }
    const documents = publicationKnowledgeDocuments(
      publication,
      await this.knowledgeBase(tx, publication),
    );
    await tx.knowledgeIndex.save(publication.personaId, publication.id, publication.hash, {
      documents,
      hash: this.services.crypto.sha256Hex(canonicalJson(documents)),
    });
    return documents;
  }

  async knowledgeGraph(
    identity: ConsumerIdentity,
    raw: unknown,
  ): Promise<
    KnowledgeGraph & {
      publicationId: string;
      hash: string;
      semanticApproval: false;
      executionAuthorized: false;
      scope: KnowledgeGraphInput["tables"];
      page: { pageSize: number; returned: number; nextCursor: string | null; complete: boolean };
      guidance: string;
    }
  > {
    const input = knowledgeGraphInputSchema.parse(raw);
    return this.authorized(identity, async (tx, state) => {
      const skill = await tx.catalog.find(identity.personaId, input.skillId);
      const publication = skill?.activePublicationId
        ? await tx.catalog.publication(identity.personaId, skill.activePublicationId)
        : null;
      if (publication) await this.lockPublishedKnowledge(tx, state.persona.ownerId, [publication]);
      if (!publication || !(await this.visibleAll(tx, identity, state, publication))) {
        throw new PersonaV2Error(
          "AUTHORIZATION_DENIED",
          "Grafo indisponível para esta skill e consumidor.",
        );
      }
      const graph = await this.graphForPublication(tx, publication);
      const tableId = (node: (typeof graph.nodes)[number]) =>
        `${node.sourceId}:${node.schema ? node.schema + "." : ""}${node.table}`;
      const filters = input.tables?.map((t) => `${t.fonteId}:${t.table}`).sort();
      if (
        filters &&
        (new Set(filters).size !== filters.length ||
          filters.some((t) => !graph.nodes.some((n) => n.kind === "table" && tableId(n) === t)))
      ) {
        throw new PersonaV2Error("AUTHORIZATION_DENIED", "Filtro de grafo indisponível.");
      }
      const nodes = graph.nodes.filter((n) => !filters || filters.includes(tableId(n))),
        nodeIds = new Set(nodes.map((n) => n.id));
      const edges = knowledgeEdgesWithExposedPaths(
        graph.edges.filter(
          (e) => nodeIds.has(e.from) && nodeIds.has(e.to) && e.via.every((id) => nodeIds.has(id)),
        ),
      );
      const items = [
        ...nodes.map((value) => ({ type: "node" as const, value })),
        ...edges.map((value) => ({ type: "edge" as const, value })),
      ].sort((a, b) => (a.value.id < b.value.id ? -1 : a.value.id > b.value.id ? 1 : 0));
      const binding = this.services.crypto.sha256Hex(
        canonicalJson({
          personaId: identity.personaId,
          personaVersion: identity.personaVersion,
          tokenId: identity.tokenId,
          tokenVersion: identity.tokenVersion,
          grantId: identity.grant?.id ?? null,
          publicationId: publication.id,
          hash: publication.hash,
          tables: filters ?? null,
          pageSize: input.pageSize,
        }),
      );
      let offset = 0;
      if (input.cursor) {
        try {
          const cursor = z
            .strictObject({
              version: z.literal(1),
              binding: z.string(),
              offset: z.number().int().positive(),
            })
            .parse(JSON.parse(this.services.crypto.decrypt(input.cursor)));
          if (
            cursor.binding !== binding ||
            cursor.offset >= items.length ||
            cursor.offset % input.pageSize !== 0
          ) {
            throw new Error("cursor mismatch");
          }
          offset = cursor.offset;
        } catch {
          throw new PersonaV2Error(
            "OPERATION_CONFLICT",
            "Página obsoleta ou de outro contexto; reinicie a leitura do grafo.",
          );
        }
      }
      const selected = items.slice(offset, offset + input.pageSize),
        complete = offset + input.pageSize >= items.length;
      return {
        publicationId: publication.id,
        hash: publication.hash,
        semanticApproval: false as const,
        executionAuthorized: false as const,
        omittedRelationships: graph.omittedRelationships + graph.edges.length - edges.length,
        nodes: selected.flatMap((item) => (item.type === "node" ? [item.value] : [])),
        edges: selected.flatMap((item) => (item.type === "edge" ? [item.value] : [])),
        scope: input.tables,
        page: {
          pageSize: input.pageSize,
          returned: selected.length,
          nextCursor: complete
            ? null
            : this.services.crypto.encrypt(
                canonicalJson({ version: 1, binding, offset: offset + input.pageSize }),
              ),
          complete,
        },
        guidance:
          "Grafo do recorte publicado concedido. Arestas podem referenciar nós em outras páginas: conclua a paginação. Filtros restringem este recorte. Relação N:N não habilita JOIN direto; significado e execução não são aprovados por esta leitura.",
      };
    });
  }

  private async graphForPublication(
    tx: PersonaTransaction,
    publication: CatalogPublication<PublishedPackage>,
  ): Promise<KnowledgeGraph> {
    const pkg = publication.package;
    if (pkg.format === "persona-query-v2") {
      return queryKnowledgeGraph(
        { ...publication, package: pkg },
        await this.knowledgeBase(tx, publication),
      );
    }
    if (pkg.format === "persona-sql-operation-v2") {
      return operationKnowledgeGraph({ ...publication, package: pkg });
    }
    const nodes: KnowledgeGraph["nodes"][number][] = [],
      edges: KnowledgeGraph["edges"][number][] = [];
    let omittedRelationships = 0;
    for (const dependency of pkg.dependencies) {
      const current = await tx.catalog.publication(publication.personaId, dependency.publicationId);
      if (current?.package.format !== "persona-query-v2" || current.hash !== dependency.hash) {
        throw new PersonaV2Error("AUTHORIZATION_DENIED", "Dependência do grafo indisponível.");
      }
      const part = queryKnowledgeGraph(
        { ...current, package: current.package },
        await this.knowledgeBase(tx, current),
      );
      // Independent publications stay distinct even when they describe the same physical table.
      const qualify = (id: string) => `${current.id}/${id}`;
      nodes.push(...part.nodes.map((node) => ({ ...node, id: qualify(node.id) })));
      edges.push(
        ...part.edges.map((edge) => ({
          ...edge,
          id: qualify(edge.id),
          from: qualify(edge.from),
          to: qualify(edge.to),
          via: edge.via.map(qualify),
          path: edge.path.map(qualify),
        })),
      );
      omittedRelationships += part.omittedRelationships;
    }
    return { nodes, edges, omittedRelationships };
  }

  async sourceForVerification(identity: ConsumerIdentity, sourceId: string): Promise<Source> {
    return this.authorized(identity, (_tx, state) => {
      const layers = assertConsumer(identity, state, this.services.now());
      const source = state.sources.find((s) => s.id === sourceId && s.active);
      if (!source || !layers.every((p) => p.sourceIds.includes(sourceId))) {
        throw new PersonaV2Error("AUTHORIZATION_DENIED", "Fonte indisponível para este token.");
      }
      return Promise.resolve(source);
    });
  }

  async list(identity: ConsumerIdentity): Promise<readonly PublishedSkillSummary[]> {
    return this.authorized(identity, async (tx, state) => {
      const visible = [];
      for (const skill of await tx.catalog.list(identity.personaId)) {
        if (!skill.activePublicationId) continue;
        const publication = await tx.catalog.publication(
          identity.personaId,
          skill.activePublicationId,
        );
        if (!publication || !(await this.visibleAll(tx, identity, state, publication))) continue;
        visible.push({
          id: skill.id,
          slug: skill.slug,
          name: publication.package.name,
          kind: skill.kind,
          publicationId: publication.id,
          hash: publication.hash,
          ...(publication.package.format !== "persona-federation-v2"
            ? { sourceId: publication.package.sourceId }
            : { sourceIds: [...new Set(publication.package.dependencies.map((d) => d.sourceId))] }),
          purpose: publication.package.purpose,
        });
      }
      return visible;
    });
  }

  /** Draft names for skills already on the token. A name does not make the publication usable. */
  async grantedSkillNames(identity: ConsumerIdentity): Promise<ReadonlyMap<string, string>> {
    return this.authorized(identity, async (tx, state) => {
      const allowed = new Set(state.token.permissions.skills.map((grant) => grant.skillId));
      const names = new Map<string, string>();
      for (const skill of await tx.catalog.list(identity.personaId)) {
        if (!allowed.has(skill.id)) continue;
        const name = skill.name.trim();
        if (name) names.set(skill.id, name);
      }
      return names;
    });
  }

  private async sharedSnapshot(
    tx: PersonaTransaction,
    identity: ConsumerIdentity,
    state: AuthorizationSnapshot,
    skillId: string,
    allowOperations = false,
  ): Promise<{
    skillId: string;
    skillPublicationId: string;
    sourceId: string;
    knowledge: NonNullable<QueryPackage["sharedKnowledge"]>;
  }> {
    const draft = await tx.catalog.find(identity.personaId, skillId);
    const publication = draft?.activePublicationId
      ? await tx.catalog.publication(identity.personaId, draft.activePublicationId)
      : null;
    if (
      (publication?.package.format !== "persona-query-v2" &&
        !(allowOperations && publication?.package.format === "persona-sql-operation-v2")) ||
      !publication.package.sharedKnowledge ||
      !(await this.visibleAll(tx, identity, state, publication))
    )
      throw new PersonaV2Error(
        "AUTHORIZATION_DENIED",
        "Conhecimento indisponível para esta skill e consumidor.",
      );
    return {
      skillId,
      skillPublicationId: publication.id,
      sourceId: publication.package.sourceId,
      knowledge: publication.package.sharedKnowledge,
    };
  }
  async sharedInTransaction(
    tx: PersonaTransaction,
    identity: ConsumerIdentity,
    state: AuthorizationSnapshot,
    skillId: string,
  ): ReturnType<PersonaConsumerCatalog["sharedSnapshot"]> {
    // Editorial callers retain their query-only contract.
    return this.sharedSnapshot(tx, identity, state, skillId);
  }

  async readPattern(
    identity: ConsumerIdentity,
    skillId: string,
  ): ReturnType<PersonaConsumerCatalog["sharedInTransaction"]> {
    return this.authorized(identity, (tx, state) =>
      this.sharedInTransaction(tx, identity, state, skillId),
    );
  }
  async knowledgeHistory(
    identity: ConsumerIdentity,
    raw: unknown,
  ): Promise<{
    versions: AuthorizedKnowledgeVersion[];
    nextCursor: string | null;
    scope: "granted_active_sql_skills";
    catalogBrowsing: false;
  }> {
    const input = knowledgeHistorySchema.parse(raw);
    return this.authorized(identity, async (tx, state) => {
      const layers = assertConsumer(identity, state, this.services.now());
      const candidates: CatalogPublication<PublishedPackage>[] = [];
      for (const skill of await tx.catalog.list(identity.personaId)) {
        if (
          !skill.activePublicationId ||
          !layers.every((p) => p.skills.some((g) => g.skillId === skill.id))
        )
          continue;
        const publication = await tx.catalog.publication(
          identity.personaId,
          skill.activePublicationId,
        );
        if (publication) candidates.push(publication);
      }
      await this.lockPublishedKnowledge(tx, state.persona.ownerId, candidates);
      const bound = await this.sharedSnapshot(tx, identity, state, input.skillId, true);
      if (!tx.knowledge)
        throw new PersonaV2Error("CAPABILITY_UNAVAILABLE", "Conhecimento indisponível.");
      const anchor = await tx.knowledge.publication(
        bound.knowledge.catalogId,
        bound.knowledge.publicationId,
      );
      if (!anchor) throw new PersonaV2Error("AUTHORIZATION_DENIED", "Conhecimento indisponível.");
      const versions: AuthorizedKnowledgeVersion[] = [];
      for (const publication of candidates) {
        const pkg = publication.package;
        if (
          (pkg.format !== "persona-query-v2" && pkg.format !== "persona-sql-operation-v2") ||
          pkg.sharedKnowledge?.catalogId !== anchor.catalogId ||
          !(await this.visibleAll(tx, identity, state, publication))
        )
          continue;
        const ref = pkg.sharedKnowledge;
        const pattern = await tx.knowledge.publication(ref.catalogId, ref.publicationId);
        if (pattern?.patternId !== anchor.patternId || pattern.suspendedAt) continue;
        versions.push({
          skillId: publication.skillId,
          skillPublicationId: publication.id,
          sourceId: pkg.sourceId,
          publicationId: pattern.id,
          hash: ref.publicationHash,
          revision: pattern.revision,
          publishedAt: pattern.publishedAt,
          ...(ref.profilePublicationId
            ? { profilePublicationId: ref.profilePublicationId, profileHash: ref.profileHash }
            : {}),
        });
      }
      // Pagination is over authorized bindings, not over all catalog versions.
      versions.sort((a, b) => b.revision - a.revision || a.skillId.localeCompare(b.skillId));
      const cursor = input.afterSkillId
        ? versions.findIndex((v) => v.skillId === input.afterSkillId)
        : -1;
      if (input.afterSkillId && cursor === -1)
        throw new PersonaV2Error("AUTHORIZATION_DENIED", "Cursor indisponível.");
      const page = versions.slice(cursor + 1, cursor + 21);
      return {
        versions: page,
        nextCursor: versions.length > cursor + 21 ? page.at(-1)!.skillId : null,
        scope: "granted_active_sql_skills" as const,
        catalogBrowsing: false as const,
      };
    });
  }

  async compareKnowledge(identity: ConsumerIdentity, raw: unknown): Promise<KnowledgeComparison> {
    const input = knowledgeComparisonSchema.parse(raw);
    return this.authorized(identity, async (tx, state) => {
      const publications: CatalogPublication<PublishedPackage>[] = [];
      for (const id of [...new Set([input.fromSkillId, input.toSkillId])].sort()) {
        const draft = await tx.catalog.find(identity.personaId, id);
        const publication = draft?.activePublicationId
          ? await tx.catalog.publication(identity.personaId, draft.activePublicationId)
          : null;
        if (!publication)
          throw new PersonaV2Error("AUTHORIZATION_DENIED", "Comparação indisponível.");
        publications.push(publication);
      }
      await this.lockPublishedKnowledge(tx, state.persona.ownerId, publications);
      const from = await this.sharedSnapshot(tx, identity, state, input.fromSkillId, true);
      const to = await this.sharedSnapshot(tx, identity, state, input.toSkillId, true);
      const a = await tx.knowledge?.publication(
        from.knowledge.catalogId,
        from.knowledge.publicationId,
      );
      const b = await tx.knowledge?.publication(to.knowledge.catalogId, to.knowledge.publicationId);
      if (!a || a.catalogId !== b?.catalogId || a.patternId !== b.patternId)
        throw new PersonaV2Error("AUTHORIZATION_DENIED", "Comparação indisponível.");
      // Compare only adopted snapshots already readable through obter_padrao,
      // never complete catalog publications or unpublished editorial material.
      const sections = Object.keys(from.knowledge.content) as (keyof StructureContent)[];
      const changes = sections
        .filter(
          (section) =>
            canonicalJson(from.knowledge.content[section]) !==
            canonicalJson(to.knowledge.content[section]),
        )
        .map((section) => ({
          section,
          before: from.knowledge.content[section],
          after: to.knowledge.content[section],
        }));
      const reference = (bound: typeof from) => ({
        skillId: bound.skillId,
        skillPublicationId: bound.skillPublicationId,
        sourceId: bound.sourceId,
        publicationId: bound.knowledge.publicationId,
        hash: bound.knowledge.publicationHash,
        profilePublicationId: bound.knowledge.profilePublicationId ?? null,
        profileHash: bound.knowledge.profileHash ?? null,
      });
      return {
        from: reference(from),
        to: reference(to),
        changes,
        scope: "granted_adopted_sql_snapshots" as const,
        catalogBrowsing: false as const,
        grantsExecution: false as const,
      };
    });
  }

  async listPatterns(identity: ConsumerIdentity): Promise<{
    patterns: readonly {
      skillId: string;
      skillPublicationId: string;
      sourceId: string;
      catalogId: string;
      publicationId: string;
      hash: string;
      system: string;
      label: string;
      profilePublicationId?: string;
      profileHash?: string;
    }[];
    catalogBrowsing: false;
  }> {
    return this.authorized(identity, async (tx, state) => {
      const patterns = [];
      for (const skill of await tx.catalog.list(identity.personaId)) {
        if (!skill.activePublicationId) continue;
        const publication = await tx.catalog.publication(
          identity.personaId,
          skill.activePublicationId,
        );
        if (
          publication?.package.format !== "persona-query-v2" ||
          !publication.package.sharedKnowledge ||
          !(await this.visibleAll(tx, identity, state, publication))
        )
          continue;
        const ref = publication.package.sharedKnowledge;
        patterns.push({
          skillId: skill.id,
          skillPublicationId: publication.id,
          sourceId: publication.package.sourceId,
          catalogId: ref.catalogId,
          publicationId: ref.publicationId,
          hash: ref.publicationHash,
          system: ref.content.system,
          label: ref.content.label,
          ...(ref.profilePublicationId
            ? { profilePublicationId: ref.profilePublicationId, profileHash: ref.profileHash }
            : {}),
        });
      }
      return { patterns, catalogBrowsing: false as const };
    });
  }

  async read(
    identity: ConsumerIdentity,
    slug: string,
  ): Promise<PublishedQueryContext | Record<string, unknown>> {
    return this.authorized(identity, async (tx, state) => {
      const skill = (await tx.catalog.list(identity.personaId)).find((s) => s.slug === slug);
      const publication = skill?.activePublicationId
        ? await tx.catalog.publication(identity.personaId, skill.activePublicationId)
        : null;
      if (!publication || !(await this.visibleAll(tx, identity, state, publication))) {
        throw new PersonaV2Error("AUTHORIZATION_DENIED", "Skill não disponível para este token.");
      }
      if (publication.package.format === "persona-sql-operation-v2")
        return {
          id: publication.skillId,
          publicationId: publication.id,
          hash: publication.hash,
          ...publication.package,
          limits: consumerOperationLimits(
            identity,
            state,
            publication.skillId,
            publication.package.training,
            this.services.now(),
          ),
        };
      if (publication.package.format === "persona-federation-v2") {
        const pkg = publication.package;
        return {
          id: publication.skillId,
          publicationId: publication.id,
          hash: publication.hash,
          format: pkg.format,
          name: pkg.name,
          purpose: pkg.purpose,
          training: pkg.training,
          steps: pkg.steps,
          output: pkg.output,
          budget: pkg.budget,
          executionBudget: consumerFederationLimits(
            identity,
            state,
            publication.skillId,
            pkg.budget,
            this.services.now(),
          ),
          commonTraining: pkg.commonTraining,
          dependencies: pkg.dependencies.map(({ publicationId, skillId, hash, sourceId }) => ({
            publicationId,
            skillId,
            hash,
            sourceId,
          })),
        };
      }
      const pkg = publication.package;
      const training = queryTrainingSchema.parse(publication.package.training);
      return {
        id: publication.skillId,
        publicationId: publication.id,
        hash: publication.hash,
        sourceId: publication.package.sourceId,
        limits: consumerQueryLimits(
          identity,
          state,
          [{ ...publication, package: pkg }],
          this.services.now(),
        ),
        dialect: publication.package.dialect,
        purpose: publication.package.purpose,
        sqlModel: publication.package.sqlModel,
        examples: (training.examples ?? []).filter(
          (e) => e.state === undefined || e.state === "approved",
        ),
        ...(pkg.sharedKnowledge ? { sharedKnowledge: pkg.sharedKnowledge } : {}),
        scope: publication.package.scope,
        parameters: training.parameters,
        ...(training.attachments ? { attachments: training.attachments } : {}),
        ...(training.binaryAttachments ? { binaryAttachments: training.binaryAttachments } : {}),
        rules: training.rules,
        ...(training.semantics ? { semantics: training.semantics } : {}),
        tables: training.tables,
        relationships: training.relationships,
        columns: training.columns.filter(
          (c) =>
            publication.package.format === "persona-query-v2" &&
            publication.package.scope.colunasPorTabela[c.table]?.includes(c.name),
        ),
        commonTraining: publication.package.commonTraining,
        requiredFilters: parseSourceRestrictions(
          state.sources.find((s) => s.id === pkg.sourceId)!.rowRestrictions,
        ).map(({ table, column, parameter }) => ({ table, column, parameter })),
      };
    });
  }

  async query(
    identity: ConsumerIdentity,
    input: { fonteId?: string; skillIds?: readonly string[]; cacheFence?: boolean },
  ): Promise<AuthorizedSourceQuery> {
    return this.authorized(identity, async (tx, state) => {
      const selected = new Set(input.skillIds);
      const publications: CatalogPublication[] = [];
      for (const skill of await tx.catalog.list(identity.personaId)) {
        if (selected.size && !selected.has(skill.id)) continue;
        const publication = skill.activePublicationId
          ? await tx.catalog.publication(identity.personaId, skill.activePublicationId)
          : null;
        if (
          publication &&
          this.visible(identity, state, publication) &&
          (await sharedQueryKnowledgeCurrent(tx, state.persona.ownerId, publication.package))
        ) {
          if (input.fonteId && publication.package.sourceId !== input.fonteId) continue;
          publications.push(publication);
        }
      }
      if (!publications.length || (selected.size && publications.length !== selected.size)) {
        throw new PersonaV2Error("AUTHORIZATION_DENIED", "Publicações indisponíveis nesta fonte.");
      }
      const sources = new Set(publications.map((p) => p.package.sourceId));
      if (sources.size !== 1) {
        throw new PersonaV2Error(
          "SOURCE_AMBIGUOUS",
          "Informe fonteId ou skills de uma única fonte.",
        );
      }
      const source = state.sources.find((s) => sources.has(s.id))!;
      const consumerExpiresAt = Math.min(
        state.token.expiresAt?.getTime() ?? Infinity,
        state.grant?.expiresAt.getTime() ?? Infinity,
        identity.grant?.expiresAt ?? Infinity,
      );
      return {
        source,
        publications,
        ...(Number.isFinite(consumerExpiresAt) ? { consumerExpiresAt } : {}),
        ...(input.cacheFence && tx.queryCacheFence
          ? { cacheFence: await tx.queryCacheFence(source) }
          : {}),
        executionLimits: consumerQueryLimits(identity, state, publications, this.services.now()),
      };
    });
  }

  async revalidateQuery(
    identity: ConsumerIdentity,
    evidence: AuthorizedSourceQuery,
    audit?: {
      validation: boolean;
      durationMs: number;
      rows: number;
      reuseKind?: "fresh" | "cache" | "singleflight";
      attachment?: { id: string; event: "created" | "downloaded"; bytes: number };
    },
  ): Promise<void> {
    await this.authorized(identity, async (tx, state) => {
      const source = state.sources.find((s) => s.id === evidence.source.id);
      if (evidence.cacheFence && !evidence.cacheFence.writePending) {
        const fence = source && (await tx.queryCacheFence?.(source));
        if (!fence || fence.writePending || fence.revision !== evidence.cacheFence.revision)
          throw new PersonaV2Error(
            "STALE_AUTHORIZATION",
            "Base alterada ou operação pendente durante a consulta; resultado descartado.",
          );
      }
      if (
        canonicalJson(evidence.executionLimits) !==
        canonicalJson(
          consumerQueryLimits(identity, state, evidence.publications, this.services.now()),
        )
      )
        throw new PersonaV2Error("STALE_AUTHORIZATION", "Limites mudaram durante a consulta.");
      if (
        !source ||
        sourceFingerprint(source, this.services.crypto) !==
          sourceFingerprint(evidence.source, this.services.crypto)
      ) {
        throw new PersonaV2Error("STALE_AUTHORIZATION", "Fonte mudou durante a consulta.");
      }
      for (const previous of evidence.publications) {
        const skill = await tx.catalog.find(identity.personaId, previous.skillId);
        const current = skill?.activePublicationId
          ? await tx.catalog.publication(identity.personaId, skill.activePublicationId)
          : null;
        if (
          current?.id !== previous.id ||
          current.hash !== previous.hash ||
          !this.visible(identity, state, current) ||
          !(await sharedQueryKnowledgeCurrent(tx, state.persona.ownerId, current.package))
        ) {
          throw new PersonaV2Error("STALE_AUTHORIZATION", "Publicação mudou durante a consulta.");
        }
        if (audit?.attachment) {
          if (!tx.recordAttachment)
            throw new PersonaV2Error("CAPABILITY_UNAVAILABLE", "Auditoria de anexo indisponível.");
          await tx.recordAttachment({
            personaId: identity.personaId,
            tokenId: identity.tokenId,
            sourceId: source.id,
            skillId: current.skillId,
            publicationId: current.id,
            ...audit.attachment,
            rows: audit.rows,
            durationMs: audit.durationMs,
          });
        } else if (audit)
          await tx.recordQuery({
            personaId: identity.personaId,
            tokenId: identity.tokenId,
            sourceId: source.id,
            skillId: current.skillId,
            publicationId: current.id,
            ...audit,
          });
      }
    });
  }

  /** Internal response to the verified agent's structural failure, never a consumer mutation. */
  async suspendStructuralQuery(
    identity: ConsumerIdentity,
    evidence: AuthorizedSourceQuery,
  ): Promise<void> {
    await this.services.repository.transaction(
      { personaIds: [identity.personaId], tokenIds: [] },
      async (tx) => {
        for (const previous of evidence.publications) {
          if (!previous.package.sharedKnowledge) continue;
          const current = await tx.catalog.publication(identity.personaId, previous.id);
          if (current?.hash !== previous.hash) continue;
          await tx.catalog.suspend(identity.personaId, previous.id, "source_structure_changed");
        }
      },
    );
  }

  private visible(
    identity: ConsumerIdentity,
    state: AuthorizationSnapshot,
    publication: CatalogPublication<PublishedPackage>,
  ): publication is CatalogPublication {
    const pkg = publication.package;
    if (pkg.format !== "persona-query-v2") return false;
    const source = state.sources.find((s) => s.id === pkg.sourceId);
    if (
      !source ||
      pkg.format !== "persona-query-v2" ||
      publication.sourceVersion !== source?.authorizationVersion ||
      publication.sourceFingerprint !== sourceFingerprint(source, this.services.crypto) ||
      publication.hash !== this.services.crypto.sha256Hex(canonicalJson(pkg))
    )
      return false;
    try {
      authorizePublication(
        identity,
        state,
        {
          id: publication.id,
          personaId: publication.personaId,
          skillId: publication.skillId,
          kind: "consulta",
          sourceIds: [pkg.sourceId],
          externalOperationIds: [],
          requiredCapabilities: pkg.requiredCapabilities,
          effects: ["select"],
          hash: publication.hash,
          suspendedAt: publication.suspendedAt,
          approval: "automatic",
        },
        this.services.now(),
      );
      return true;
    } catch (error) {
      if (error instanceof PersonaV2Error && error.code === "AUTHORIZATION_DENIED") return false;
      throw error;
    }
  }

  async federation(
    identity: ConsumerIdentity,
    publicationId: string,
    audit?: { validation: boolean; durationMs: number; rows: number; steps: number },
  ): Promise<CatalogPublication<FederationPackage> & { executionBudget: FederationBudget }> {
    return this.authorized(identity, async (tx, state) => {
      const publication = await tx.catalog.publication(identity.personaId, publicationId);
      if (
        publication?.package.format !== "persona-federation-v2" ||
        !(await this.visibleAll(tx, identity, state, publication))
      )
        throw new PersonaV2Error(
          "AUTHORIZATION_DENIED",
          "Cruzamento ou dependência indisponível para este token.",
        );
      if (audit)
        await tx.recordFederation({
          personaId: identity.personaId,
          tokenId: identity.tokenId,
          skillId: publication.skillId,
          publicationId: publication.id,
          ...audit,
        });
      return {
        ...publication,
        package: publication.package,
        executionBudget: consumerFederationLimits(
          identity,
          state,
          publication.skillId,
          publication.package.budget,
          this.services.now(),
        ),
      };
    });
  }

  private async visibleAll(
    tx: PersonaTransaction,
    identity: ConsumerIdentity,
    state: AuthorizationSnapshot,
    p: CatalogPublication<PublishedPackage>,
  ): Promise<boolean> {
    if (p.package.format === "persona-query-v2")
      return (
        this.visible(identity, state, p) &&
        (await sharedQueryKnowledgeCurrent(tx, state.persona.ownerId, p.package))
      );
    const pkg = p.package;
    const skill = await tx.catalog.find(identity.personaId, p.skillId);
    if (
      skill?.activePublicationId !== p.id ||
      p.hash !== this.services.crypto.sha256Hex(canonicalJson(pkg))
    )
      return false;
    if (pkg.format === "persona-sql-operation-v2") {
      const source = state.sources.find((s) => s.id === pkg.sourceId);
      if (!source) return false;
      try {
        authorizeOperationPublication(
          identity,
          state,
          { ...p, package: pkg },
          source,
          this.services.crypto,
          this.services.now(),
        );
        return sharedOperationKnowledgeCurrent(tx, state.persona.ownerId, pkg);
      } catch (e) {
        if (e instanceof PersonaV2Error) return false;
        throw e;
      }
    }
    for (const dependency of pkg.dependencies) {
      const current = await tx.catalog.publication(identity.personaId, dependency.publicationId);
      const draft = await tx.catalog.find(identity.personaId, dependency.skillId);
      if (
        !current ||
        draft?.activePublicationId !== current.id ||
        current.skillId !== dependency.skillId ||
        current.hash !== dependency.hash ||
        current.sourceFingerprint !== dependency.sourceFingerprint ||
        current.sourceVersion !== dependency.sourceVersion ||
        !this.visible(identity, state, current) ||
        !(await sharedQueryKnowledgeCurrent(tx, state.persona.ownerId, current.package)) ||
        current.package.sourceId !== dependency.sourceId
      )
        return false;
    }
    try {
      authorizePublication(
        identity,
        state,
        {
          id: p.id,
          personaId: p.personaId,
          skillId: p.skillId,
          kind: "cruzamento",
          sourceIds: [...new Set(pkg.dependencies.map((d) => d.sourceId))],
          externalOperationIds: [],
          requiredCapabilities: pkg.requiredCapabilities,
          effects: ["select"],
          hash: p.hash,
          suspendedAt: p.suspendedAt,
          approval: "automatic",
        },
        this.services.now(),
      );
      return true;
    } catch (error) {
      if (error instanceof PersonaV2Error && error.code === "AUTHORIZATION_DENIED") return false;
      throw error;
    }
  }
}
