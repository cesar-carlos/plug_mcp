import type { PersonaTransaction } from "../../domain/ports/persona-v2.port.js";
import type { CryptoPort } from "../../domain/ports/crypto.port.js";
import { canonicalJson, type SkillDraft } from "../../domain/persona-v2/catalog.js";
import { PersonaV2Error } from "../../domain/persona-v2/model.js";
import { operationTrainingSchema } from "../../domain/persona-v2/operation-training.js";
import { fixtureSeedsSchema } from "../../domain/persona-v2/publication-fixture.js";
import {
  datasetCompositionSeedsSchema,
  datasetCompositionSelectionSchema,
  type DatasetCompositionSelection,
  type DatasetCompositionSeeds,
  type DatasetCompositionOrigin,
} from "../../domain/persona-v2/dataset-composition.js";
import { readLibraryDataset } from "./library-dataset.js";
import { datasetFixtureSeeds } from "./dataset-case-seeds.js";
import { assertOperationDatasetColumns } from "./operation-dataset.js";
import { compileFederationTraining } from "./federation-training.js";
import { queryTrainingSchema } from "./query-training.js";

interface SeedPart {
  fixtures: DatasetCompositionSeeds["fixtures"];
  contracts: Record<string, string>;
}
/** Explicit concatenation, no coercion, joins, deduplication or inferred identity. */
export function mergeDatasetFixtures(
  parts: readonly SeedPart[],
): DatasetCompositionSeeds["fixtures"] {
  const fixtures: DatasetCompositionSeeds["fixtures"] = [];
  const contracts = new Map<string, string>();
  for (const part of parts)
    for (const seed of part.fixtures) {
      const contract = part.contracts[seed.table];
      if (!contract || (contracts.has(seed.table) && contracts.get(seed.table) !== contract))
        throw new PersonaV2Error(
          "INVALID_PLAN",
          "Datasets da mesma tabela exigem template e colunas idênticos.",
        );
      contracts.set(seed.table, contract);
      const prior = fixtures.find((item) => item.table === seed.table);
      if (prior) prior.rows.push(...seed.rows);
      else fixtures.push({ ...seed, rows: [...seed.rows] });
    }
  const parsed = fixtureSeedsSchema.safeParse(fixtures);
  if (!parsed.success)
    throw new PersonaV2Error(
      "INVALID_PLAN",
      "Combinação excede 16 tabelas ou 100 linhas por tabela; não há truncamento.",
    );
  return parsed.data;
}

export async function readDatasetComposition(
  tx: PersonaTransaction,
  owner: string,
  draft: SkillDraft,
  crypto: CryptoPort,
  raw: DatasetCompositionSelection,
  publicationId?: string,
): Promise<DatasetCompositionSeeds> {
  const selection = datasetCompositionSelectionSchema.parse(raw);
  const operation =
    draft.kind === "operacao_sql" && !publicationId
      ? operationTrainingSchema.parse(draft.training)
      : undefined;
  const dependency =
    draft.kind === "cruzamento" && publicationId
      ? (
          await compileFederationTraining(tx, draft.personaId, draft.name, draft.training, crypto)
        ).dependencies.find((d) => d.publicationId === publicationId)
      : undefined;
  if (!operation && !dependency)
    throw new PersonaV2Error(
      "INVALID_PLAN",
      "Selecione operação SQL ou publicação pertencente ao cruzamento.",
    );
  const publication = dependency
    ? await tx.catalog.publication(draft.personaId, dependency.publicationId)
    : undefined;
  const query =
    publication?.package.format === "persona-query-v2"
      ? queryTrainingSchema.parse(publication.package.training)
      : undefined;
  if (dependency && !query)
    throw new PersonaV2Error("OPERATION_CONFLICT", "Publicação de consulta indisponível.");
  const scope = operation
    ? {
        dialect: operation.dialect,
        tables: operation.tables,
        columns: operation.tables.flatMap((table) =>
          table.columns.map((column) => ({
            table: table.name,
            name: column.name,
            classification: column.classification ?? "livre",
          })),
        ),
      }
    : query!;
  const sourceId = operation?.sourceId ?? dependency!.sourceId;
  const source = (await tx.listSources(draft.personaId)).find(
    (item) => item.id === sourceId && item.active,
  );
  if (source?.dialect !== scope.dialect)
    throw new PersonaV2Error("OPERATION_CONFLICT", "Fonte indisponível ou dialeto incompatível.");
  const parts: SeedPart[] = [];
  const materials: DatasetCompositionOrigin["materials"] = [];
  for (const chosen of selection.materials) {
    const { dataset, template, templateRecord } = await readLibraryDataset(
      tx,
      owner,
      crypto,
      chosen,
    );
    if (operation) assertOperationDatasetColumns(dataset, template, operation);
    const fixtures = datasetFixtureSeeds(template, dataset, scope);
    const templateRef = {
      id: templateRecord.id,
      version: templateRecord.version,
      hash: templateRecord.hash,
    };
    const contracts: Record<string, string> = {};
    for (const [index, table] of dataset.tables.entries()) {
      contracts[fixtures[index]!.table] = canonicalJson({
        catalogId: chosen.catalogId,
        template: templateRef,
        columns: [...table.columns].sort((a, b) => a.name.localeCompare(b.name)),
      });
    }
    parts.push({ fixtures, contracts });
    materials.push({
      ...chosen,
      template: templateRef,
      sourceSeedsHash: crypto.sha256Hex(canonicalJson(fixtures)),
    });
  }
  const fixtures = mergeDatasetFixtures(parts);
  const sourceSeedsHash = crypto.sha256Hex(canonicalJson(fixtures));
  return datasetCompositionSeedsSchema.parse({
    revision: draft.revision,
    sourceId,
    fixtures,
    origin: {
      format: dependency
        ? "federation-source-dataset-composition-v1"
        : "operation-dataset-composition-v1",
      sourceId,
      sourceVersion: source.authorizationVersion,
      dialect: source.dialect,
      materials,
      sourceSeedsHash,
      caseSeedsHash: sourceSeedsHash,
      modified: false,
      ...(dependency
        ? { publicationId: dependency.publicationId, publicationHash: dependency.hash }
        : {}),
    },
    executable: false,
    technicalApproval: false,
  });
}

export function confirmDatasetComposition(
  supplied: DatasetCompositionOrigin,
  current: DatasetCompositionSeeds,
  fixtures: unknown,
  crypto: Pick<CryptoPort, "sha256Hex">,
): DatasetCompositionOrigin {
  const binding = (value: DatasetCompositionOrigin) => ({
    format: value.format,
    sourceId: value.sourceId,
    sourceVersion: value.sourceVersion,
    dialect: value.dialect,
    materials: value.materials.map((item) => ({
      catalogId: item.catalogId,
      template: item.template,
      dataset: item.dataset,
    })),
    ...(value.format === "federation-source-dataset-composition-v1"
      ? { publicationId: value.publicationId, publicationHash: value.publicationHash }
      : {}),
  });
  if (canonicalJson(binding(supplied)) !== canonicalJson(binding(current.origin)))
    throw new PersonaV2Error(
      "OPERATION_CONFLICT",
      "Composição editorial mudou; confira material, fonte e publicação.",
    );
  const caseSeedsHash = crypto.sha256Hex(canonicalJson(fixtures));
  return {
    ...current.origin,
    caseSeedsHash,
    modified: caseSeedsHash !== current.origin.sourceSeedsHash,
  };
}
