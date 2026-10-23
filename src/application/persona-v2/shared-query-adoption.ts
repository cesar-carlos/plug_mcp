import type { PersonaServices, PersonaTransaction } from "../../domain/ports/persona-v2.port.js";
import type { QueryPackage } from "../../domain/persona-v2/catalog.js";
import { canonicalJson } from "../../domain/persona-v2/catalog.js";
import { PersonaV2Error, type Source } from "../../domain/persona-v2/model.js";
import { storedStructureEvidenceSchema } from "../../domain/persona-v2/source-schema.js";
import { compareStructureEvidence, matchesStructureResource } from "./structure-compatibility.js";
import type { QueryTraining } from "./query-training.js";
import { constraintExpectation } from "./constraint-expectation.js";
import { publishedProfileHash } from "./physical-profiles.js";
import { queryTrainingSchema } from "./query-training.js";
import { assertQueryRelationshipPaths } from "./query-relationship-paths.js";
import { matchesSharedRelationship } from "./shared-relationship.js";
import type { AdoptedKnowledge } from "../../domain/persona-v2/knowledge-adoption.js";
import { executableField } from "../../domain/persona-v2/field-use.js";

export type StructuralKnowledgeTraining = Pick<
  QueryTraining,
  "sharedKnowledge" | "tables" | "columns" | "relationships" | "rules"
>;

/** Explicit adoption at preview/publication. No copy-on-update or inherited grants. */
export async function adoptStructuralKnowledge(
  tx: PersonaTransaction,
  ownerId: string,
  source: Source,
  training: StructuralKnowledgeTraining,
  services: Pick<PersonaServices, "crypto" | "now">,
  keyDependencies?: ReadonlyMap<string, readonly (readonly string[])[]>,
): Promise<AdoptedKnowledge | undefined> {
  const ref = training.sharedKnowledge;
  if (!ref) return undefined;
  assertQueryRelationshipPaths(training);
  if (training.columns.some((c) => !executableField(c)))
    throw new PersonaV2Error(
      "CAPABILITY_UNAVAILABLE",
      "Adoção exige campos confirmados com finalidades executáveis explícitas.",
    );
  if (!tx.knowledge || !(await tx.knowledge.catalog(ref.catalogId, ownerId)))
    throw new PersonaV2Error("AUTHORIZATION_DENIED", "Catálogo não concedido ao responsável.");
  const publication = await tx.knowledge.publication(ref.catalogId, ref.publicationId);
  const stored = await tx.structureEvidence(source.personaId, ref.evidenceId);
  if (
    !publication ||
    publication.suspendedAt ||
    publication.hash !== services.crypto.sha256Hex(canonicalJson(publication.content))
  )
    throw new PersonaV2Error("AUTHORIZATION_DENIED", "Versão compartilhada indisponível.");
  if (
    stored?.sourceId !== source.id ||
    stored.sourceVersion !== source.authorizationVersion ||
    stored.credentialVersion !== source.credentialVersion ||
    stored.identityHash !== source.identityHash ||
    stored.expiresAt <= services.now() ||
    stored.hash !== services.crypto.sha256Hex(canonicalJson(stored.evidence))
  )
    throw new PersonaV2Error(
      "STALE_AUTHORIZATION",
      "Inspecione novamente a estrutura desta fonte antes de publicar.",
    );
  const profile = ref.profilePublicationId
    ? await tx.profiles?.publication(ref.catalogId, ref.profilePublicationId)
    : null;
  if (
    ref.profilePublicationId &&
    (!profile ||
      profile.suspended ||
      profile.physicalSourceId !== source.physicalSourceId ||
      profile.identityHash !== source.identityHash ||
      profile.basePublicationId !== publication.id ||
      profile.baseHash !== publication.hash ||
      publishedProfileHash(profile, services) !== profile.hash)
  )
    throw new PersonaV2Error(
      "AUTHORIZATION_DENIED",
      "Perfil físico indisponível ou incompatível com esta base.",
    );
  const adoptedContent = profile?.content ?? publication.content;
  const physical = (table: (typeof publication.content.tables)[number]) =>
    table.physicalNames.find((n) => n.dialect === source.dialect)?.name ?? table.name;
  const tables = training.tables.map((table) => {
    const matches = adoptedContent.tables.filter(
      (t) => physical(t) === table.name && t.resourceType === table.resourceType,
    );
    const common = matches.length === 1 ? matches[0] : undefined;
    if (
      common?.meaning !== table.meaning ||
      canonicalJson(common.grain) !== canonicalJson(table.grain)
    )
      throw new PersonaV2Error(
        "INVALID_PLAN",
        "Tabela, significado ou grão diverge do padrão; revise explicitamente.",
      );
    const columns = training.columns
      .filter((c) => c.table === table.name)
      .map((column) => {
        const field = common.columns.find((c) => c.name === column.name);
        if (field?.meaning !== column.meaning || field.classification !== column.classification)
          throw new PersonaV2Error(
            "INVALID_PLAN",
            "Campo ou classificação diverge do padrão compartilhado.",
          );
        return field;
      });
    return {
      ...common,
      columns,
      keys: common.keys?.filter(
        (k) =>
          k.columns.every((c) => columns.some((field) => field.name === c)) &&
          (!keyDependencies ||
            keyDependencies
              .get(table.name)
              ?.some((columns) => canonicalJson(columns) === canonicalJson(k.columns))),
      ),
    };
  });
  const relationships = training.relationships.map((relation) => {
    const matches = adoptedContent.relationships.filter((r) =>
      matchesSharedRelationship({ ...adoptedContent, tables }, source.dialect, relation, r),
    );
    if (matches.length !== 1)
      throw new PersonaV2Error(
        "INVALID_PLAN",
        "Relacionamento requer resolução explícita com o padrão.",
      );
    return matches[0]!;
  });
  if (adoptedContent.rules.some((rule) => !training.rules.includes(rule)))
    throw new PersonaV2Error(
      "INVALID_PLAN",
      "O treinamento precisa preservar as regras do padrão adotado.",
    );
  const content = { ...adoptedContent, tables, relationships, examples: [] };
  const evidence = storedStructureEvidenceSchema.parse(stored.evidence);
  if (compareStructureEvidence(content, evidence).status !== "compatible")
    throw new PersonaV2Error(
      "INCOMPLETE_INPUT",
      "Dependências estruturais não comprovadas; consulte o diagnóstico de compatibilidade.",
    );
  return {
    ...ref,
    ...(profile ? { profileHash: profile.hash } : {}),
    publicationHash: publication.hash,
    evidenceHash: stored.hash,
    content,
    expectedStructure: {
      version: 1,
      resources: tables.map((table) => {
        const name = physical(table);
        const observed = evidence.resources.find((r) =>
          matchesStructureResource(name, r.resource, source.dialect),
        )!;
        const constraints = constraintExpectation(content, evidence, table.id);
        return {
          resource: observed.resource,
          ...(constraints.primaryKeys.length ||
          constraints.uniqueKeys.length ||
          constraints.foreignKeys.length
            ? { constraints }
            : {}),
          columns: observed.columns
            .filter((c) => table.columns.some((f) => f.name === c.name))
            .map(({ ordinal: _ordinal, ...column }) => column),
        };
      }),
    },
  };
}

export async function adoptQueryKnowledge(
  tx: PersonaTransaction,
  ownerId: string,
  source: Source,
  training: QueryTraining,
  services: Pick<PersonaServices, "crypto" | "now">,
): Promise<QueryPackage["sharedKnowledge"]> {
  return adoptStructuralKnowledge(tx, ownerId, source, training, services);
}

/** Called on discovery, direct access, before dispatch and before delivery. */
export async function sharedQueryKnowledgeCurrent(
  tx: PersonaTransaction,
  ownerId: string,
  pkg: QueryPackage,
): Promise<boolean> {
  const ref = pkg.sharedKnowledge;
  if (!ref) return true;
  const parsed = queryTrainingSchema.safeParse(pkg.training);
  if (!parsed.success) return false;
  try {
    assertQueryRelationshipPaths(parsed.data);
  } catch {
    return false;
  }
  if (
    parsed.data.relationships.some(
      (r) =>
        !ref.content.relationships.some((common) =>
          matchesSharedRelationship(ref.content, pkg.dialect, r, common),
        ),
    )
  )
    return false;
  return sharedKnowledgeCurrent(tx, ownerId, ref);
}

/** Membership and publication suspension are checked under the catalog lock on every use. */
export async function sharedKnowledgeCurrent(
  tx: PersonaTransaction,
  ownerId: string,
  ref: AdoptedKnowledge,
): Promise<boolean> {
  if (!tx.knowledge || !(await tx.knowledge.catalog(ref.catalogId, ownerId))) return false;
  const publication = await tx.knowledge.publication(ref.catalogId, ref.publicationId);
  if (!publication || publication.suspendedAt || publication.hash !== ref.publicationHash)
    return false;
  if (ref.profilePublicationId) {
    const profile = await tx.profiles?.publication(ref.catalogId, ref.profilePublicationId);
    return (
      !!profile &&
      !profile.suspended &&
      profile.hash === ref.profileHash &&
      profile.basePublicationId === publication.id
    );
  }
  return true;
}
