import type { PersonaTransaction } from "../../domain/ports/persona-v2.port.js";
import type { CryptoPort } from "../../domain/ports/crypto.port.js";
import type { SkillDraft } from "../../domain/persona-v2/catalog.js";
import { canonicalJson } from "../../domain/persona-v2/catalog.js";
import {
  datasetCaseBinding,
  type DatasetCaseOrigin,
} from "../../domain/persona-v2/dataset-case-origin.js";
import {
  datasetCaseOptionsSchema,
  type DatasetCaseOptions,
  type DatasetVersionReference,
} from "../../domain/persona-v2/dataset-case-options.js";
import { PersonaV2Error } from "../../domain/persona-v2/model.js";
import { operationScalarSchema } from "../../domain/persona-v2/operation-training.js";
import { fixtureSeedsSchema } from "../../domain/persona-v2/publication-fixture.js";
import {
  datasetCaseSeedsSchema,
  type DatasetCaseSeeds,
} from "../../domain/persona-v2/dataset-case-seeds.js";
import { queryTrainingSchema, type QueryTraining } from "./query-training.js";
import { decodeLibrary, validateDataset, type LibraryPayload } from "./knowledge-library-schema.js";

type Template = Extract<LibraryPayload, { kind: "template" }>;
type Dataset = Extract<LibraryPayload, { kind: "dataset" }>;

export function datasetFixtureSeeds(
  template: Template,
  dataset: Dataset,
  training: QueryTraining,
): DatasetCaseSeeds["fixtures"] {
  validateDataset(dataset, template);
  const physicalTables = new Set<string>();
  const fixtures = dataset.tables.map((table) => {
    const definition = template.content.tables.find((t) => t.id === table.tableId)!;
    const physical =
      definition.physicalNames.find((p) => p.dialect === training.dialect)?.name ?? definition.name;
    if (
      definition.resourceType !== "table" ||
      physicalTables.has(physical) ||
      !training.tables.some((t) => t.name === physical && t.resourceType !== "view") ||
      table.columns.some(
        (c) =>
          !training.columns.some(
            (field) =>
              field.table === physical && field.name === c.name && field.classification === "livre",
          ),
      )
    ) {
      throw new PersonaV2Error(
        "INVALID_PLAN",
        "Dataset contém tabela ou campo fora do treinamento livre atual.",
      );
    }
    physicalTables.add(physical);
    if (table.columns.some((column) => column.type === "number")) {
      throw new PersonaV2Error(
        "INVALID_PLAN",
        "Runner não aceita ponto flutuante nesta semente; revise o dataset sem conversão automática.",
      );
    }
    const rows = table.rows.map((row) =>
      Object.fromEntries(
        table.columns.map((column, index) => {
          const value = row[index]!;
          const scalar = operationScalarSchema.safeParse(
            value === null
              ? { type: "null", value: null }
              : {
                  type: column.type === "datetime" ? "date" : column.type,
                  value: column.type === "integer" ? String(value) : value,
                },
          );
          if (!scalar.success) {
            throw new PersonaV2Error(
              "INVALID_PLAN",
              "Valor do dataset não cabe nos tipos do runner; revise o material.",
            );
          }
          return [column.name, scalar.data];
        }),
      ),
    );
    return { table: physical, generated: [], rows };
  });
  const parsed = fixtureSeedsSchema.safeParse(fixtures);
  if (!parsed.success) {
    throw new PersonaV2Error(
      "INVALID_PLAN",
      "Dataset excede os limites ou nomes das sementes: até 16 tabelas e 100 registros por tabela; não há truncamento.",
    );
  }
  return parsed.data;
}

async function datasetContext(
  tx: PersonaTransaction,
  ownerId: string,
  draft: SkillDraft,
  crypto: CryptoPort,
) {
  const library = tx.knowledge?.library;
  const origin = await library?.draftOrigin(draft.personaId, draft.id);
  if (!library || !origin) {
    throw new PersonaV2Error(
      "INCOMPLETE_INPUT",
      "Este rascunho não tem origem de importação de template.",
    );
  }
  const catalog = await tx.knowledge.catalog(origin.catalogId, ownerId);
  if (!["administrator", "curator", "contributor"].includes(catalog?.role ?? "")) {
    throw new PersonaV2Error("AUTHORIZATION_DENIED", "Dataset editorial indisponível.");
  }
  const training = queryTrainingSchema.parse(draft.training);
  const source = (await tx.listSources(draft.personaId)).find(
    (s) => s.id === origin.sourceId && s.active,
  );
  if (
    source?.authorizationVersion !== origin.sourceVersion ||
    training.sourceId !== origin.sourceId ||
    training.dialect !== origin.dialect ||
    source.dialect !== training.dialect
  ) {
    throw new PersonaV2Error(
      "OPERATION_CONFLICT",
      "A fonte ou o treinamento mudou desde a importação; não reassociar o dataset automaticamente.",
    );
  }
  const templateRecord = await library.get(
    origin.catalogId,
    origin.templateId,
    origin.templateVersion,
  );
  if (templateRecord?.kind !== "template") {
    throw new PersonaV2Error("AUTHORIZATION_DENIED", "Template editorial de origem indisponível.");
  }
  const template = decodeLibrary(templateRecord, crypto);
  if (template.kind !== "template") {
    throw new PersonaV2Error("INVALID_PLAN", "Integridade do template de origem inválida.");
  }
  return { library, origin, training, source, templateRecord, template };
}

export async function readDatasetCaseOptions(
  tx: PersonaTransaction,
  ownerId: string,
  draft: SkillDraft,
  crypto: CryptoPort,
  after?: { id: string; version: number },
): Promise<DatasetCaseOptions> {
  const { library, origin, source, templateRecord } = await datasetContext(
    tx,
    ownerId,
    draft,
    crypto,
  );
  const records = await library.datasetVersions(
    origin.catalogId,
    origin.templateId,
    origin.templateVersion,
    after,
  );
  const last = records[19];
  return datasetCaseOptionsSchema.parse({
    revision: draft.revision,
    sourceId: source.id,
    catalogId: origin.catalogId,
    template: { id: templateRecord.id, version: templateRecord.version, hash: templateRecord.hash },
    datasets: records.slice(0, 20),
    nextCursor: records.length > 20 && last ? { id: last.id, version: last.version } : null,
  });
}

export async function readDatasetCaseSeeds(
  tx: PersonaTransaction,
  ownerId: string,
  draft: SkillDraft,
  crypto: CryptoPort,
  selected?: DatasetVersionReference,
): Promise<DatasetCaseSeeds> {
  const { library, origin, training, source, templateRecord, template } = await datasetContext(
    tx,
    ownerId,
    draft,
    crypto,
  );
  const datasetId = selected?.id ?? origin.datasetId;
  const datasetVersion = selected?.version ?? origin.datasetVersion;
  if (!datasetId || !datasetVersion) {
    throw new PersonaV2Error(
      "INCOMPLETE_INPUT",
      "Escolha uma versão de dataset para este template; a importação não tem dataset associado.",
    );
  }
  const datasetRecord = await library.get(origin.catalogId, datasetId, datasetVersion);
  if (
    datasetRecord?.kind !== "dataset" ||
    datasetRecord.templateId !== templateRecord.id ||
    datasetRecord.templateVersion !== templateRecord.version
  ) {
    throw new PersonaV2Error("AUTHORIZATION_DENIED", "Versões editoriais de origem indisponíveis.");
  }
  if (selected && datasetRecord.hash !== selected.hash) {
    throw new PersonaV2Error(
      "OPERATION_CONFLICT",
      "O hash não corresponde à versão de dataset escolhida.",
    );
  }
  const dataset = decodeLibrary(datasetRecord, crypto);
  if (
    template.kind !== "template" ||
    dataset.kind !== "dataset" ||
    dataset.templateHash !== templateRecord.hash
  ) {
    throw new PersonaV2Error("INVALID_PLAN", "Integridade das referências editoriais inválida.");
  }
  const fixtures = datasetFixtureSeeds(template, dataset, training);
  const sourceSeedsHash = crypto.sha256Hex(canonicalJson(fixtures));
  return datasetCaseSeedsSchema.parse({
    revision: draft.revision,
    sourceId: source.id,
    catalogId: origin.catalogId,
    template: { id: templateRecord.id, version: templateRecord.version, hash: templateRecord.hash },
    dataset: {
      id: datasetRecord.id,
      version: datasetRecord.version,
      hash: datasetRecord.hash,
      name: datasetRecord.name,
    },
    fixtures,
    origin: {
      format: "dataset-case-origin-v1",
      catalogId: origin.catalogId,
      sourceId: source.id,
      sourceVersion: source.authorizationVersion,
      dialect: source.dialect,
      template: {
        id: templateRecord.id,
        version: templateRecord.version,
        hash: templateRecord.hash,
      },
      dataset: { id: datasetRecord.id, version: datasetRecord.version, hash: datasetRecord.hash },
      sourceSeedsHash,
      caseSeedsHash: sourceSeedsHash,
      modified: false,
    },
    executable: false,
    technicalApproval: false,
  });
}

/** Ignore client-supplied status/hashes; validate references and derive them again. */
export function confirmedDatasetCaseOrigin(
  supplied: DatasetCaseOrigin,
  current: DatasetCaseSeeds,
  fixtures: DatasetCaseSeeds["fixtures"],
  crypto: Pick<CryptoPort, "sha256Hex">,
): DatasetCaseOrigin {
  if (
    canonicalJson(datasetCaseBinding(supplied)) !==
    canonicalJson(datasetCaseBinding(current.origin))
  ) {
    throw new PersonaV2Error(
      "OPERATION_CONFLICT",
      "A origem editorial não corresponde à importação vigente; preserve o caso e confira o material.",
    );
  }
  const caseSeedsHash = crypto.sha256Hex(canonicalJson(fixtures));
  return {
    ...current.origin,
    caseSeedsHash,
    modified: caseSeedsHash !== current.origin.sourceSeedsHash,
  };
}
