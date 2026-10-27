import { computed, ref, watch, type Ref } from "vue";
import {
  datasetCompositionSeedsSchema,
  type DatasetCompositionSeeds,
  type DatasetCompositionSelection,
} from "../../../src/domain/persona-v2/dataset-composition";
import {
  directOperationDatasetSeedsSchema,
  type DirectOperationDatasetSeeds,
} from "../../../src/domain/persona-v2/direct-operation-dataset";
import {
  canSelectLibraryDataset,
  compositionHasMaterial,
  compositionMaterialRefs,
  compositionSeedsMatchSelection,
  directOperationSeedsMatchSelection,
  editorialLibraryCatalogs,
  isCompositionSeeds,
  libraryCatalogListSchema,
  libraryDatasetItemSchema,
  libraryDatasetPageError,
  libraryDatasetPageSchema,
  listedDatasetVersion,
  mergeLibraryDatasets,
  receivedLibraryDatasetMatches,
  type DirectOperationDatasetMaterial,
  type DirectOperationDatasetPreview,
  type LibraryCatalog,
  type LibraryDatasetItem,
} from "./direct-operation-dataset";
import { useDatasetRequest } from "./useDatasetRequest";
import { useErrorSummary } from "./useErrorSummary";

export interface DirectOperationDatasetPickerProps {
  api: <T>(url: string, body?: unknown) => Promise<T>;
  base: string;
  skillId: string;
  revision: number;
  sourceId: string;
  disabled: boolean;
  federationPublicationId?: string;
}

export interface DirectOperationDatasetPickerEmit {
  (event: "choose", value: DirectOperationDatasetSeeds): void;
  (event: "composition", value: DatasetCompositionSeeds): void;
  (event: "lock", value: boolean): void;
}

export interface DirectOperationDatasetState {
  catalogs: Ref<LibraryCatalog[]>;
  items: Ref<LibraryDatasetItem[]>;
  catalogId: Ref<string>;
  datasetId: Ref<string>;
  version: Ref<number>;
  cursor: Ref<string | null>;
  preview: Ref<DirectOperationDatasetPreview | undefined>;
  materials: Ref<DirectOperationDatasetMaterial[]>;
  error: Ref<string>;
  errorSummary: Ref<HTMLElement | undefined>;
  busy: Ref<boolean>;
  loadCatalogs: () => Promise<void>;
  loadItems: (more?: boolean) => Promise<void>;
  addMaterial: () => Promise<void>;
  prepare: (combine?: boolean) => Promise<void>;
  apply: () => void;
}

/** Direct choose and composition share library selection, preview union, lock, and
 *  federation single-item prepare; splitting those emits would change this public API. */
export function useDirectOperationDataset(
  props: DirectOperationDatasetPickerProps,
  emit: DirectOperationDatasetPickerEmit,
): DirectOperationDatasetState {
  const catalogs = ref<LibraryCatalog[]>([]);
  const items = ref<LibraryDatasetItem[]>([]);
  const catalogId = ref("");
  const datasetId = ref("");
  const version = ref(1);
  const cursor = ref<string | null>(null);
  const preview = ref<DirectOperationDatasetPreview>();
  const materials = ref<DirectOperationDatasetMaterial[]>([]);
  const { error, errorSummary } = useErrorSummary();
  const context = computed(() =>
    JSON.stringify([
      props.base,
      props.skillId,
      props.revision,
      props.sourceId,
      props.federationPublicationId,
      materials.value,
      catalogId.value,
      datasetId.value,
      version.value,
    ]),
  );
  const { busy, run } = useDatasetRequest(
    () => context.value,
    () => props.disabled,
    error,
    () => {
      preview.value = undefined;
    },
    (value) => emit("lock", value),
  );
  watch(
    () => [
      props.base,
      props.skillId,
      props.revision,
      props.sourceId,
      props.federationPublicationId,
    ],
    () => {
      catalogs.value = [];
      materials.value = [];
      catalogId.value = "";
      resetItems();
    },
    { flush: "sync" },
  );
  watch(catalogId, resetItems, { flush: "sync" });
  watch(
    datasetId,
    () => {
      version.value = listedDatasetVersion(items.value, datasetId.value);
    },
    { flush: "sync" },
  );

  function resetItems(): void {
    items.value = [];
    datasetId.value = "";
    cursor.value = null;
    preview.value = undefined;
  }

  async function selectedMaterial(
    isCurrent: () => boolean,
  ): Promise<DirectOperationDatasetMaterial | undefined> {
    if (!canSelectLibraryDataset(items.value, datasetId.value, version.value)) {
      throw new Error("Escolha um dataset e uma versão inteira positiva.");
    }
    const item = libraryDatasetItemSchema.parse(
      await props.api(
        `/api/admin/catalogos/${catalogId.value}/biblioteca/${datasetId.value}?version=${version.value}`,
      ),
    );
    if (!isCurrent()) {
      return;
    }
    if (!receivedLibraryDatasetMatches(item, datasetId.value, version.value)) {
      throw new Error("A versão recebida não corresponde à seleção.");
    }
    return {
      catalogId: catalogId.value,
      dataset: { id: item.id, version: item.version, hash: item.hash },
      name: item.name,
    };
  }

  async function loadCatalogs(): Promise<void> {
    await run(async (isCurrent) => {
      preview.value = undefined;
      const result = libraryCatalogListSchema.parse(await props.api("/api/admin/catalogos"));
      if (!isCurrent()) {
        return;
      }
      catalogs.value = editorialLibraryCatalogs(result.catalogs);
      catalogId.value = "";
      resetItems();
      if (!catalogs.value.length) {
        error.value = "Nenhum catálogo com acesso editorial disponível.";
      }
    });
  }

  async function loadItems(more = false): Promise<void> {
    await run(async (isCurrent) => {
      if (!catalogId.value || (more && !cursor.value)) {
        return;
      }
      preview.value = undefined;
      const result = libraryDatasetPageSchema.parse(
        await props.api(
          `/api/admin/catalogos/${catalogId.value}/biblioteca${more ? `?beforeId=${cursor.value}` : ""}`,
        ),
      );
      if (!isCurrent()) {
        return;
      }
      items.value = mergeLibraryDatasets(items.value, result.items, more);
      cursor.value = result.nextCursor;
      if (!more) {
        datasetId.value = "";
      }
      const pageError = libraryDatasetPageError(items.value.length, cursor.value);
      if (pageError) {
        error.value = pageError;
      }
    });
  }

  async function addMaterial(): Promise<void> {
    await run(async (isCurrent) => {
      if (materials.value.length >= 4) {
        throw new Error("Escolha no máximo quatro datasets por fonte.");
      }
      const selected = await selectedMaterial(isCurrent);
      if (!selected || !isCurrent()) {
        return;
      }
      if (compositionHasMaterial(materials.value, selected)) {
        throw new Error("Essa versão já está na combinação.");
      }
      materials.value = [...materials.value, selected];
    });
  }

  async function prepareComposition(
    isCurrent: () => boolean,
    chosen: DatasetCompositionSelection["materials"],
  ): Promise<void> {
    const result = datasetCompositionSeedsSchema.parse(
      await props.api(`${props.base}/skills/${props.skillId}/compor-sementes-datasets`, {
        expectedRevision: props.revision,
        materials: chosen,
        ...(props.federationPublicationId ? { publicationId: props.federationPublicationId } : {}),
      }),
    );
    if (!isCurrent()) {
      return;
    }
    if (
      !compositionSeedsMatchSelection({
        result,
        revision: props.revision,
        sourceId: props.sourceId,
        federationPublicationId: props.federationPublicationId,
        chosen,
      })
    ) {
      throw new Error("Composição recebida não corresponde à seleção.");
    }
    preview.value = result;
  }

  async function prepare(combine = false): Promise<void> {
    await run(async (isCurrent) => {
      preview.value = undefined;
      if (combine) {
        if (!materials.value.length) {
          return;
        }
        await prepareComposition(isCurrent, compositionMaterialRefs(materials.value));
        return;
      }
      const selected = await selectedMaterial(isCurrent);
      if (!selected || !isCurrent()) {
        return;
      }
      if (props.federationPublicationId) {
        await prepareComposition(isCurrent, [
          { catalogId: selected.catalogId, dataset: selected.dataset },
        ]);
        return;
      }
      const item = selected.dataset;
      const result = directOperationDatasetSeedsSchema.parse(
        await props.api(`${props.base}/skills/${props.skillId}/sementes-dataset-operacao-direto`, {
          expectedRevision: props.revision,
          catalogId: catalogId.value,
          dataset: { id: item.id, version: item.version, hash: item.hash },
        }),
      );
      if (!isCurrent()) {
        return;
      }
      if (
        !directOperationSeedsMatchSelection({
          result,
          revision: props.revision,
          sourceId: props.sourceId,
          catalogId: catalogId.value,
          dataset: item,
        })
      ) {
        throw new Error("A origem das sementes mudou; confira novamente o material.");
      }
      preview.value = result;
    });
  }

  function apply(): void {
    if (props.disabled || busy.value || !preview.value) {
      return;
    }
    if (isCompositionSeeds(preview.value)) {
      emit("composition", datasetCompositionSeedsSchema.parse(preview.value));
    } else {
      emit("choose", directOperationDatasetSeedsSchema.parse(preview.value));
    }
    preview.value = undefined;
  }

  return {
    catalogs,
    items,
    catalogId,
    datasetId,
    version,
    cursor,
    preview,
    materials,
    error,
    errorSummary,
    busy,
    loadCatalogs,
    loadItems,
    addMaterial,
    prepare,
    apply,
  };
}
