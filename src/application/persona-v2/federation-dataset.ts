import type { PersonaTransaction } from "../../domain/ports/persona-v2.port.js";
import type { CryptoPort } from "../../domain/ports/crypto.port.js";
import { canonicalJson, type SkillDraft } from "../../domain/persona-v2/catalog.js";
import { PersonaV2Error } from "../../domain/persona-v2/model.js";
import {
  federationDatasetSeedsSchema,
  type FederationDatasetSeeds,
  type FederationDatasetSelection,
  type FederationDatasetOrigin,
} from "../../domain/persona-v2/federation-dataset.js";
import { federationPublicationCaseSchema } from "../../domain/persona-v2/federation-training.js";
import { datasetCaseBinding } from "../../domain/persona-v2/dataset-case-origin.js";
import { readDatasetCaseSeeds } from "./dataset-case-seeds.js";
import { compileFederationTraining, assertFederationContract } from "./federation-training.js";
import { queryTrainingSchema } from "./query-training.js";
import { readDatasetComposition, confirmDatasetComposition } from "./dataset-composition.js";

export async function readFederationDatasetSeeds(
  tx: PersonaTransaction,
  owner: string,
  draft: SkillDraft,
  crypto: CryptoPort,
  selection: FederationDatasetSelection,
): Promise<FederationDatasetSeeds> {
  if (draft.kind !== "cruzamento")
    throw new PersonaV2Error("INVALID_PLAN", "Selecione um cruzamento.");
  const pkg = await compileFederationTraining(
    tx,
    draft.personaId,
    draft.name,
    draft.training,
    crypto,
  );
  const dependency = pkg.dependencies.find(
    (item) =>
      item.publicationId === selection.publicationId && item.skillId === selection.querySkillId,
  );
  if (!dependency)
    throw new PersonaV2Error(
      "INVALID_PLAN",
      "Consulta não pertence às dependências do cruzamento.",
    );
  const query = await tx.catalog.find(draft.personaId, selection.querySkillId);
  const publication = await tx.catalog.publication(draft.personaId, selection.publicationId);
  if (
    query?.revision !== selection.queryRevision ||
    publication?.package.format !== "persona-query-v2" ||
    canonicalJson(queryTrainingSchema.parse(query.training)) !==
      canonicalJson(queryTrainingSchema.parse(publication.package.training))
  ) {
    throw new PersonaV2Error(
      "OPERATION_CONFLICT",
      "Consulta editorial mudou em relação à publicação; confira o contrato antes de usar o dataset.",
    );
  }
  const seeds = await readDatasetCaseSeeds(tx, owner, query, crypto, selection.dataset);
  if (seeds.sourceId !== dependency.sourceId)
    throw new PersonaV2Error("INVALID_PLAN", "Dataset pertence a outra fonte.");
  return federationDatasetSeedsSchema.parse({
    ...seeds,
    revision: draft.revision,
    origin: {
      ...seeds.origin,
      format: "federation-source-dataset-v1",
      querySkillId: query.id,
      queryRevision: query.revision,
      publicationId: dependency.publicationId,
      publicationHash: dependency.hash,
    },
  });
}

export async function confirmFederationDatasetOrigin(
  tx: PersonaTransaction,
  owner: string,
  draft: SkillDraft,
  crypto: CryptoPort,
  content: unknown,
): Promise<FederationDatasetOrigin> {
  const parsed = federationPublicationCaseSchema.parse(content);
  const origin = parsed.editorialOrigin!;
  const pkg = await compileFederationTraining(
    tx,
    draft.personaId,
    draft.name,
    draft.training,
    crypto,
  );
  assertFederationContract(pkg, parsed.input.plan);
  const expectedSources = [...new Set(pkg.dependencies.map((item) => item.sourceId))].sort();
  if (
    canonicalJson(parsed.input.sources.map((item) => item.sourceId).sort()) !==
    canonicalJson(expectedSources)
  ) {
    throw new PersonaV2Error(
      "INVALID_PLAN",
      "Fontes do caso devem corresponder exatamente ao cruzamento, sem duplicatas.",
    );
  }
  const sources: FederationDatasetOrigin["sources"] = [];
  for (const supplied of origin.sources) {
    const fixture = parsed.input.sources.find((item) => item.sourceId === supplied.sourceId);
    if (!fixture)
      throw new PersonaV2Error(
        "INVALID_PLAN",
        "Origem editorial sem fonte correspondente no caso.",
      );
    if (supplied.format === "federation-source-dataset-composition-v1") {
      const current = await readDatasetComposition(
        tx,
        owner,
        draft,
        crypto,
        { materials: supplied.materials.map(({ catalogId, dataset }) => ({ catalogId, dataset })) },
        supplied.publicationId,
      );
      const confirmed = confirmDatasetComposition(supplied, current, fixture.fixtures, crypto);
      if (confirmed.format !== "federation-source-dataset-composition-v1")
        throw new PersonaV2Error("INVALID_PLAN", "Origem de cruzamento inválida.");
      sources.push(confirmed);
      continue;
    }
    const current = await readFederationDatasetSeeds(tx, owner, draft, crypto, supplied);
    const binding = (value: typeof supplied) => ({
      ...datasetCaseBinding({ ...value, format: "dataset-case-origin-v1" }),
      querySkillId: value.querySkillId,
      queryRevision: value.queryRevision,
      publicationId: value.publicationId,
      publicationHash: value.publicationHash,
    });
    if (canonicalJson(binding(supplied)) !== canonicalJson(binding(current.origin))) {
      throw new PersonaV2Error(
        "OPERATION_CONFLICT",
        "Origem editorial do cruzamento mudou; preserve o caso e confira as fontes.",
      );
    }
    const caseSeedsHash = crypto.sha256Hex(canonicalJson(fixture.fixtures));
    sources.push({
      ...current.origin,
      caseSeedsHash,
      modified: caseSeedsHash !== current.origin.sourceSeedsHash,
    });
  }
  return { format: "federation-dataset-case-origin-v1", sources };
}
