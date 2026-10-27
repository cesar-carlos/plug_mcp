import { z } from "zod";
import type { StructureContent } from "../../../src/domain/persona-v2/shared-knowledge";
import type { LibraryPayload } from "../../../src/application/persona-v2/knowledge-library-schema";
import type { ImportedDraftReference } from "./model";

export interface LibraryItem {
  templateId?: string | null;
  templateVersion?: number | null;
  id: string;
  slug: string;
  name: string;
  kind: string;
  version: number;
  hash: string;
  payload?: LibraryPayload;
}

export interface LibrarySource {
  id: string;
  name: string;
  dialect: string;
  authorizationVersion: number;
}

export function libraryMaterialFingerprint(payload: string, slug: string, name: string): string {
  return JSON.stringify({ payload, slug, name });
}

export function libraryMaterialUnsaved(
  payload: string,
  slug: string,
  name: string,
  saved: string,
): boolean {
  return libraryMaterialFingerprint(payload, slug, name) !== saved;
}

export function libraryDatasetEditorBlocked(input: {
  disabled: boolean;
  busy: boolean;
  materialUnsaved: boolean;
  ddl: string;
  system: string;
  label: string;
  personaId: string;
  sourceId: string;
  chosenDialect: string;
  exampleId: string;
  datasetId: string;
  skillSlug: string;
  skillName: string;
}): boolean {
  return (
    input.disabled ||
    input.busy ||
    input.materialUnsaved ||
    !!(
      input.ddl ||
      input.system ||
      input.label ||
      input.personaId ||
      input.sourceId ||
      input.chosenDialect ||
      input.exampleId ||
      input.datasetId ||
      input.skillSlug ||
      input.skillName
    )
  );
}

export function libraryDestinationFilled(input: {
  ddl: string;
  system: string;
  label: string;
  personaId: string;
  sourceId: string;
  chosenDialect: string;
  exampleId: string;
  additionalExampleIds: readonly string[];
  datasetId: string;
  skillSlug: string;
  skillName: string;
}): boolean {
  return !!(
    input.ddl ||
    input.system ||
    input.label ||
    input.personaId ||
    input.sourceId ||
    input.chosenDialect ||
    input.exampleId ||
    input.additionalExampleIds.length ||
    input.datasetId ||
    input.skillSlug ||
    input.skillName
  );
}

export function libraryPanelDirty(input: {
  datasetDirty: boolean;
  payload: string;
  slug: string;
  name: string;
  saved: string;
  ddl: string;
  system: string;
  label: string;
  personaId: string;
  sourceId: string;
  chosenDialect: string;
  exampleId: string;
  additionalExampleIds: readonly string[];
  datasetId: string;
  skillSlug: string;
  skillName: string;
}): boolean {
  return (
    input.datasetDirty ||
    (libraryMaterialUnsaved(input.payload, input.slug, input.name, input.saved) &&
      !!(input.payload || input.slug || input.name)) ||
    libraryDestinationFilled(input)
  );
}

export function libraryTemplateContent(
  item: LibraryItem | undefined,
): StructureContent | undefined {
  return item?.payload?.kind === "template" ? item.payload.content : undefined;
}

export function libraryAdditionalExamples(
  template: StructureContent | undefined,
  exampleId: string,
  chosenDialect: string,
): NonNullable<StructureContent["examples"]> {
  return (
    template?.examples.filter(
      (example) =>
        example.id !== exampleId &&
        example.variants.some((variant) => variant.dialect === chosenDialect),
    ) ?? []
  );
}

export function libraryDatasetsForTemplate(
  items: readonly LibraryItem[],
  selected: LibraryItem | undefined,
): LibraryItem[] {
  return items.filter(
    (item) =>
      item.kind === "dataset" &&
      item.templateId === selected?.id &&
      item.templateVersion === selected?.version,
  );
}

export function parseLibraryMaterial(payload: string): unknown {
  let raw: unknown;
  try {
    raw = JSON.parse(payload);
  } catch {
    throw new Error("JSON inválido. Confira a estrutura do material.");
  }
  if (new TextEncoder().encode(payload).length > 50 * 1024) {
    throw new Error("Material excede 50 KiB.");
  }
  return raw;
}

export function parseCreatedLibraryDraft(
  raw: unknown,
  destinationPersona: string,
): ImportedDraftReference {
  const data = z
    .object({
      skill: z.object({
        id: z.uuid(),
        personaId: z.uuid(),
        kind: z.literal("consulta"),
        name: z.string().min(1).max(200),
      }),
    })
    .safeParse(raw);
  if (!data.success || data.data.skill.personaId !== destinationPersona) {
    throw new Error(
      "Não foi possível confirmar o rascunho. Confira a lista da persona antes de importar novamente.",
    );
  }
  return {
    personaId: destinationPersona,
    skillId: data.data.skill.id,
    name: data.data.skill.name,
  };
}

export function buildLibraryDraftRequest(input: {
  catalogId: string;
  item: LibraryItem;
  source: Pick<LibrarySource, "id" | "authorizationVersion">;
  dialect: string;
  exampleId: string;
  additionalExampleIds: readonly string[];
  dataset?: Pick<LibraryItem, "id" | "version" | "hash">;
  slug: string;
  name: string;
}): unknown {
  return {
    catalogId: input.catalogId,
    templateId: input.item.id,
    templateVersion: input.item.version,
    templateHash: input.item.hash,
    sourceId: input.source.id,
    sourceVersion: input.source.authorizationVersion,
    dialect: input.dialect,
    exampleId: input.exampleId,
    additionalExampleIds: input.additionalExampleIds,
    ...(input.dataset
      ? {
          dataset: {
            id: input.dataset.id,
            version: input.dataset.version,
            hash: input.dataset.hash,
          },
        }
      : {}),
    slug: input.slug,
    name: input.name,
  };
}
