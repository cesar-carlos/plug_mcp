import type { PersonaTransaction } from "../../domain/ports/persona-v2.port.js";
import type { CryptoPort } from "../../domain/ports/crypto.port.js";
import type { SkillDraft } from "../../domain/persona-v2/catalog.js";
import { canonicalJson } from "../../domain/persona-v2/catalog.js";
import { PersonaV2Error } from "../../domain/persona-v2/model.js";
import {
  operationTrainingSchema,
  type OperationTraining,
} from "../../domain/persona-v2/operation-training.js";
import {
  operationDatasetSeedsSchema,
  type OperationDatasetSelection,
  type OperationDatasetSeeds,
  type OperationDatasetOrigin,
} from "../../domain/persona-v2/operation-dataset.js";
import { datasetCaseBinding } from "../../domain/persona-v2/dataset-case-origin.js";
import { readDatasetCaseSeeds } from "./dataset-case-seeds.js";
import { queryTrainingSchema } from "./query-training.js";
import { decodeLibrary, type LibraryPayload } from "./knowledge-library-schema.js";

export async function readOperationDatasetSeeds(
  tx: PersonaTransaction,
  owner: string,
  draft: SkillDraft,
  crypto: CryptoPort,
  selection: OperationDatasetSelection,
): Promise<OperationDatasetSeeds> {
  if (draft.kind !== "operacao_sql") {
    throw new PersonaV2Error("INVALID_PLAN", "Selecione uma operação SQL.");
  }
  const query = await tx.catalog.find(draft.personaId, selection.querySkillId);
  if (query?.kind !== "consulta" || query.revision !== selection.queryRevision) {
    throw new PersonaV2Error(
      "OPERATION_CONFLICT",
      "Consulta editorial mudou ou está indisponível; confira a revisão.",
    );
  }
  const training = operationTrainingSchema.parse(draft.training);
  const queryTraining = queryTrainingSchema.parse(query.training);
  if (training.sourceId !== queryTraining.sourceId || training.dialect !== queryTraining.dialect) {
    throw new PersonaV2Error(
      "INVALID_PLAN",
      "O material editorial deve usar a mesma fonte e dialeto da operação.",
    );
  }
  // Reuses only authorized editorial reads, not query grants, publications or test reports.
  const seeds = await readDatasetCaseSeeds(tx, owner, query, crypto, selection.dataset);
  const library = tx.knowledge?.library;
  if (!library) {
    throw new PersonaV2Error("AUTHORIZATION_DENIED", "Biblioteca editorial indisponível.");
  }
  const datasetRecord = await library.get(seeds.catalogId, seeds.dataset.id, seeds.dataset.version);
  const templateRecord = await library.get(
    seeds.catalogId,
    seeds.template.id,
    seeds.template.version,
  );
  if (!datasetRecord || !templateRecord) {
    throw new PersonaV2Error("OPERATION_CONFLICT", "Material editorial indisponível.");
  }
  const dataset = decodeLibrary(datasetRecord, crypto);
  const template = decodeLibrary(templateRecord, crypto);
  if (dataset.kind !== "dataset" || template.kind !== "template") {
    throw new PersonaV2Error("INVALID_PLAN", "Material editorial incompatível.");
  }
  assertOperationDatasetColumns(dataset, template, training);
  return operationDatasetSeedsSchema.parse({
    ...seeds,
    revision: draft.revision,
    origin: {
      ...seeds.origin,
      format: "operation-dataset-case-origin-v1",
      querySkillId: query.id,
      queryRevision: query.revision,
    },
  });
}

/** No alias matching or type coercion, including empty/all-null datasets. */
export function assertOperationDatasetColumns(
  dataset: Extract<LibraryPayload, { kind: "dataset" }>,
  template: Extract<LibraryPayload, { kind: "template" }>,
  training: OperationTraining,
): void {
  for (const dataTable of dataset.tables) {
    const definition = template.content.tables.find((item) => item.id === dataTable.tableId);
    if (definition?.resourceType !== "table") {
      throw new PersonaV2Error("INVALID_PLAN", "Dataset exige tabela física declarada.");
    }
    const physical =
      definition.physicalNames.find((item) => item.dialect === training.dialect)?.name ??
      definition.name;
    const table = training.tables.find((item) => item.name === physical);
    if (!table) {
      throw new PersonaV2Error("INVALID_PLAN", "Tabela do dataset não pertence à operação.");
    }
    for (const field of dataTable.columns) {
      const column = table?.columns.find((item) => item.name === field.name);
      const type = field.type === "datetime" ? "date" : field.type;
      if (!column || (column.classification ?? "livre") !== "livre" || column.type !== type) {
        throw new PersonaV2Error(
          "INVALID_PLAN",
          "Coluna declarada no dataset incompatível com a operação.",
        );
      }
    }
  }
}

export function operationDatasetBinding(
  value: OperationDatasetOrigin,
): ReturnType<typeof datasetCaseBinding> &
  Pick<OperationDatasetOrigin, "querySkillId" | "queryRevision"> {
  return {
    ...datasetCaseBinding({ ...value, format: "dataset-case-origin-v1" }),
    querySkillId: value.querySkillId,
    queryRevision: value.queryRevision,
  };
}

export function confirmOperationDatasetOrigin(
  supplied: OperationDatasetOrigin,
  current: OperationDatasetSeeds,
  fixtures: unknown,
  crypto: Pick<CryptoPort, "sha256Hex">,
): OperationDatasetOrigin {
  if (
    canonicalJson(operationDatasetBinding(supplied)) !==
    canonicalJson(operationDatasetBinding(current.origin))
  ) {
    throw new PersonaV2Error(
      "OPERATION_CONFLICT",
      "Origem editorial mudou; preserve o caso e confira o material.",
    );
  }
  const caseSeedsHash = crypto.sha256Hex(canonicalJson(fixtures));
  return {
    ...current.origin,
    caseSeedsHash,
    modified: caseSeedsHash !== current.origin.sourceSeedsHash,
  };
}
