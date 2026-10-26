import type { PersonaTransaction } from "../../domain/ports/persona-v2.port.js";
import type { CryptoPort } from "../../domain/ports/crypto.port.js";
import { PersonaV2Error } from "../../domain/persona-v2/model.js";
import type { DirectOperationDatasetSelection } from "../../domain/persona-v2/direct-operation-dataset.js";
import { decodeLibrary, type LibraryPayload } from "./knowledge-library-schema.js";
import type { KnowledgeLibraryVersion } from "../../domain/ports/knowledge-library.port.js";

/** Read exact, immutable editorial material under the current catalogue role. */
export async function readLibraryDataset(
  tx: PersonaTransaction,
  owner: string,
  crypto: CryptoPort,
  selection: DirectOperationDatasetSelection,
): Promise<{
  record: KnowledgeLibraryVersion;
  dataset: Extract<LibraryPayload, { kind: "dataset" }>;
  templateRecord: KnowledgeLibraryVersion;
  template: Extract<LibraryPayload, { kind: "template" }>;
}> {
  const library = tx.knowledge?.library;
  const catalog = await tx.knowledge?.catalog(selection.catalogId, owner);
  if (!library || !["administrator", "curator", "contributor"].includes(catalog?.role ?? ""))
    throw new PersonaV2Error("AUTHORIZATION_DENIED", "Dataset editorial indisponível.");
  const record = await library.get(
    selection.catalogId,
    selection.dataset.id,
    selection.dataset.version,
  );
  if (record?.kind !== "dataset")
    throw new PersonaV2Error("AUTHORIZATION_DENIED", "Dataset editorial indisponível.");
  if (record.hash !== selection.dataset.hash)
    throw new PersonaV2Error("OPERATION_CONFLICT", "Hash da versão de dataset divergente.");
  const dataset = decodeLibrary(record, crypto);
  if (dataset.kind !== "dataset")
    throw new PersonaV2Error("INVALID_PLAN", "Material editorial incompatível.");
  const templateRecord = await library.get(
    selection.catalogId,
    dataset.templateId,
    dataset.templateVersion,
  );
  if (
    templateRecord?.kind !== "template" ||
    templateRecord.hash !== dataset.templateHash ||
    record.templateId !== templateRecord.id ||
    record.templateVersion !== templateRecord.version
  )
    throw new PersonaV2Error(
      "OPERATION_CONFLICT",
      "Template do dataset indisponível ou divergente.",
    );
  const template = decodeLibrary(templateRecord, crypto);
  if (template.kind !== "template")
    throw new PersonaV2Error("INVALID_PLAN", "Template editorial incompatível.");
  return { record, dataset, templateRecord, template };
}
