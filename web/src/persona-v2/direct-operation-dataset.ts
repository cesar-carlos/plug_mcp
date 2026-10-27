import { z } from "zod";
import type {
  DatasetCompositionSeeds,
  DatasetCompositionSelection,
} from "../../../src/domain/persona-v2/dataset-composition";
import type { DirectOperationDatasetSeeds } from "../../../src/domain/persona-v2/direct-operation-dataset";

export const libraryCatalogSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  role: z.string(),
});
export const libraryDatasetItemSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  kind: z.string(),
  version: z.number().int().positive(),
  hash: z.string().regex(/^[a-f0-9]{64}$/),
});
export const libraryCatalogListSchema = z.object({
  catalogs: z.array(libraryCatalogSchema),
});
export const libraryDatasetPageSchema = z.object({
  items: z.array(libraryDatasetItemSchema),
  nextCursor: z.uuid().nullable(),
});

export type LibraryCatalog = z.infer<typeof libraryCatalogSchema>;
export type LibraryDatasetItem = z.infer<typeof libraryDatasetItemSchema>;
export type DirectOperationDatasetMaterial = DatasetCompositionSelection["materials"][number] & {
  name: string;
};
export type DirectOperationDatasetPreview = DirectOperationDatasetSeeds | DatasetCompositionSeeds;

export const editorialCatalogRoles = ["administrator", "curator", "contributor"] as const;

export function editorialLibraryCatalogs(catalogs: readonly LibraryCatalog[]): LibraryCatalog[] {
  return catalogs.filter((catalog) =>
    (editorialCatalogRoles as readonly string[]).includes(catalog.role),
  );
}

export function mergeLibraryDatasets(
  previous: readonly LibraryDatasetItem[],
  page: readonly LibraryDatasetItem[],
  more: boolean,
): LibraryDatasetItem[] {
  const datasets = page.filter((item) => item.kind === "dataset");
  if (!more) {
    return datasets;
  }
  return [...previous, ...datasets.filter((item) => !previous.some((old) => old.id === item.id))];
}

export function listedDatasetVersion(
  items: readonly Pick<LibraryDatasetItem, "id" | "version">[],
  datasetId: string,
): number {
  return items.find((item) => item.id === datasetId)?.version ?? 1;
}

export function canSelectLibraryDataset(
  items: readonly Pick<LibraryDatasetItem, "id">[],
  datasetId: string,
  version: number,
): boolean {
  return (
    items.some((item) => item.id === datasetId) && Number.isSafeInteger(version) && version >= 1
  );
}

export function receivedLibraryDatasetMatches(
  item: Pick<LibraryDatasetItem, "id" | "version" | "kind">,
  datasetId: string,
  version: number,
): boolean {
  return item.id === datasetId && item.version === version && item.kind === "dataset";
}

export function compositionHasMaterial(
  materials: readonly DirectOperationDatasetMaterial[],
  selected: DirectOperationDatasetMaterial,
): boolean {
  return materials.some(
    (item) =>
      item.catalogId === selected.catalogId &&
      item.dataset.id === selected.dataset.id &&
      item.dataset.version === selected.dataset.version,
  );
}

export function compositionMaterialRefs(
  materials: readonly DirectOperationDatasetMaterial[],
): DatasetCompositionSelection["materials"] {
  return materials.map(({ catalogId, dataset }) => ({ catalogId, dataset }));
}

export function libraryDatasetPageError(
  itemCount: number,
  cursor: string | null,
): string | undefined {
  if (itemCount) {
    return undefined;
  }
  return cursor
    ? "Nenhum dataset nesta página; carregue mais itens."
    : "Nenhum dataset disponível neste catálogo.";
}

export function isCompositionSeeds(
  preview: DirectOperationDatasetPreview,
): preview is DatasetCompositionSeeds {
  return "materials" in preview.origin;
}

export function compositionSeedsMatchSelection(input: {
  result: DatasetCompositionSeeds;
  revision: number;
  sourceId: string;
  federationPublicationId?: string;
  chosen: DatasetCompositionSelection["materials"];
}): boolean {
  const refs = input.result.origin.materials.map(({ catalogId, dataset }) => ({
    catalogId,
    dataset,
  }));
  if (
    input.result.revision !== input.revision ||
    input.result.sourceId !== input.sourceId ||
    JSON.stringify(refs) !== JSON.stringify(input.chosen)
  ) {
    return false;
  }
  if (input.federationPublicationId) {
    return (
      input.result.origin.format === "federation-source-dataset-composition-v1" &&
      input.result.origin.publicationId === input.federationPublicationId
    );
  }
  return input.result.origin.format === "operation-dataset-composition-v1";
}

export function directOperationSeedsMatchSelection(input: {
  result: DirectOperationDatasetSeeds;
  revision: number;
  sourceId: string;
  catalogId: string;
  dataset: { id: string; version: number; hash: string };
}): boolean {
  return (
    input.result.revision === input.revision &&
    input.result.sourceId === input.sourceId &&
    input.result.catalogId === input.catalogId &&
    input.result.dataset.id === input.dataset.id &&
    input.result.dataset.version === input.dataset.version &&
    input.result.dataset.hash === input.dataset.hash
  );
}
