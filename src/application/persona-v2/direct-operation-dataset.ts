import type { PersonaTransaction } from "../../domain/ports/persona-v2.port.js";
import type { CryptoPort } from "../../domain/ports/crypto.port.js";
import { canonicalJson, type SkillDraft } from "../../domain/persona-v2/catalog.js";
import { PersonaV2Error } from "../../domain/persona-v2/model.js";
import { operationTrainingSchema } from "../../domain/persona-v2/operation-training.js";
import {
  directOperationDatasetSeedsSchema,
  type DirectOperationDatasetSelection,
  type DirectOperationDatasetSeeds,
  type DirectOperationDatasetOrigin,
} from "../../domain/persona-v2/direct-operation-dataset.js";
import { datasetCaseBinding } from "../../domain/persona-v2/dataset-case-origin.js";
import { datasetFixtureSeeds } from "./dataset-case-seeds.js";
import { readLibraryDataset } from "./library-dataset.js";
import { assertOperationDatasetColumns } from "./operation-dataset.js";

/** Copies only typed editorial seeds; does not create a query or import its authority. */
export async function readDirectOperationDatasetSeeds(
  tx: PersonaTransaction,
  owner: string,
  draft: SkillDraft,
  crypto: CryptoPort,
  selection: DirectOperationDatasetSelection,
): Promise<DirectOperationDatasetSeeds> {
  if (draft.kind !== "operacao_sql")
    throw new PersonaV2Error("INVALID_PLAN", "Selecione uma operação SQL.");
  const training = operationTrainingSchema.parse(draft.training);
  const source = (await tx.listSources(draft.personaId)).find(
    (s) => s.id === training.sourceId && s.active,
  );
  if (source?.dialect !== training.dialect)
    throw new PersonaV2Error("OPERATION_CONFLICT", "Fonte indisponível ou dialeto incompatível.");
  const { record, dataset, templateRecord, template } = await readLibraryDataset(
    tx,
    owner,
    crypto,
    selection,
  );
  assertOperationDatasetColumns(dataset, template, training);
  const fixtures = datasetFixtureSeeds(template, dataset, {
    dialect: training.dialect,
    tables: training.tables,
    columns: training.tables.flatMap((table) =>
      table.columns.map((column) => ({
        table: table.name,
        name: column.name,
        classification: column.classification ?? "livre",
      })),
    ),
  });
  const templateRef = {
    id: templateRecord.id,
    version: templateRecord.version,
    hash: templateRecord.hash,
  };
  const sourceSeedsHash = crypto.sha256Hex(canonicalJson(fixtures));
  return directOperationDatasetSeedsSchema.parse({
    revision: draft.revision,
    sourceId: source.id,
    catalogId: selection.catalogId,
    template: templateRef,
    dataset: { ...selection.dataset, name: record.name },
    fixtures,
    origin: {
      format: "operation-direct-dataset-case-origin-v1",
      catalogId: selection.catalogId,
      sourceId: source.id,
      sourceVersion: source.authorizationVersion,
      dialect: source.dialect,
      template: templateRef,
      dataset: selection.dataset,
      sourceSeedsHash,
      caseSeedsHash: sourceSeedsHash,
      modified: false,
    },
    executable: false,
    technicalApproval: false,
  });
}

export function confirmDirectOperationDatasetOrigin(
  supplied: DirectOperationDatasetOrigin,
  current: DirectOperationDatasetSeeds,
  fixtures: unknown,
  crypto: Pick<CryptoPort, "sha256Hex">,
): DirectOperationDatasetOrigin {
  const binding = (value: DirectOperationDatasetOrigin) =>
    datasetCaseBinding({ ...value, format: "dataset-case-origin-v1" });
  if (canonicalJson(binding(supplied)) !== canonicalJson(binding(current.origin)))
    throw new PersonaV2Error(
      "OPERATION_CONFLICT",
      "Origem editorial mudou; confira o material e a fonte.",
    );
  const caseSeedsHash = crypto.sha256Hex(canonicalJson(fixtures));
  return {
    ...current.origin,
    caseSeedsHash,
    modified: caseSeedsHash !== current.origin.sourceSeedsHash,
  };
}
