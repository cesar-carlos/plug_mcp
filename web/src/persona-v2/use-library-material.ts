import { computed, ref, type ComputedRef, type Ref } from "vue";
import type { LibraryPayload } from "../../../src/application/persona-v2/knowledge-library-schema";
import {
  libraryDatasetsForTemplate,
  libraryMaterialFingerprint,
  libraryMaterialUnsaved,
  libraryTemplateContent,
  parseLibraryMaterial,
  type LibraryItem,
} from "./library-panel";
import type { StructureContent } from "../../../src/domain/persona-v2/shared-knowledge";

export function useLibraryMaterial(input: {
  api: <T>(url: string, body?: unknown) => Promise<T>;
  run: (action: () => Promise<void>) => Promise<void>;
  isLive: () => boolean;
  root: ComputedRef<string>;
  message: Ref<string>;
  onShow: () => void;
}): {
  items: Ref<LibraryItem[]>;
  cursor: Ref<string | null>;
  selected: Ref<LibraryItem | undefined>;
  payload: Ref<string>;
  slug: Ref<string>;
  name: Ref<string>;
  saved: Ref<string>;
  datasetDirty: Ref<boolean>;
  datasetEditorVersion: Ref<number>;
  historyVersion: Ref<number>;
  template: ComputedRef<StructureContent | undefined>;
  datasets: ComputedRef<LibraryItem[]>;
  materialUnsaved: ComputedRef<boolean>;
  load: (more?: boolean) => Promise<void>;
  show: (item: LibraryItem) => void;
  save: () => Promise<void>;
  saveDataset: (input: { slug: string; name: string; payload: LibraryPayload }) => Promise<void>;
  clearMaterial: () => void;
  captureFrom: (content: unknown) => void;
} {
  const items = ref<LibraryItem[]>([]);
  const cursor = ref<string | null>(null);
  const selected = ref<LibraryItem>();
  const payload = ref("");
  const slug = ref("");
  const name = ref("");
  const saved = ref("");
  const datasetDirty = ref(false);
  const datasetEditorVersion = ref(0);
  const historyVersion = ref(1);
  const template = computed(() => libraryTemplateContent(selected.value));
  const datasets = computed(() => libraryDatasetsForTemplate(items.value, selected.value));
  const materialUnsaved = computed(() =>
    libraryMaterialUnsaved(payload.value, slug.value, name.value, saved.value),
  );
  function show(item: LibraryItem): void {
    datasetEditorVersion.value++;
    datasetDirty.value = false;
    input.onShow();
    selected.value = item;
    slug.value = item.slug;
    name.value = item.name;
    payload.value = JSON.stringify(item.payload, null, 2);
    saved.value = libraryMaterialFingerprint(payload.value, slug.value, name.value);
    historyVersion.value = item.version;
  }
  function clearMaterial(): void {
    selected.value = undefined;
    payload.value = "";
    slug.value = "";
    name.value = "";
    saved.value = "";
  }
  function captureFrom(content: unknown): void {
    selected.value = undefined;
    payload.value = JSON.stringify({ kind: "template", content }, null, 2);
    slug.value = "";
    name.value = "";
    saved.value = "";
  }
  async function load(more = false): Promise<void> {
    await input.run(async () => {
      const data = await input.api<{ items: LibraryItem[]; nextCursor: string | null }>(
        input.root.value +
          "/biblioteca" +
          (more && cursor.value ? `?beforeId=${cursor.value}` : ""),
      );
      if (input.isLive()) {
        items.value = more ? [...items.value, ...data.items] : data.items;
        cursor.value = data.nextCursor;
      }
    });
  }
  async function save(): Promise<void> {
    await input.run(async () => {
      const raw = parseLibraryMaterial(payload.value);
      const data = await input.api<LibraryItem>(
        input.root.value + "/biblioteca" + (selected.value ? `/${selected.value.id}/versoes` : ""),
        {
          slug: slug.value,
          name: name.value,
          expectedVersion: selected.value?.version ?? 0,
          payload: raw,
        },
      );
      if (input.isLive()) {
        show(data);
        input.message.value =
          "Versão editorial salva. Exemplos permanecem candidatos; nenhuma publicação ou aprovação foi herdada.";
      }
    });
  }
  async function saveDataset(record: {
    slug: string;
    name: string;
    payload: LibraryPayload;
  }): Promise<void> {
    await input.run(async () => {
      const data = await input.api<LibraryItem>(input.root.value + "/biblioteca", {
        ...record,
        expectedVersion: 0,
      });
      if (input.isLive()) {
        show(data);
        datasetDirty.value = false;
        input.message.value =
          "Dataset editorial salvo com a versão exata do template. Nenhum caso ou relatório foi aprovado.";
      }
    });
  }
  return {
    items,
    cursor,
    selected,
    payload,
    slug,
    name,
    saved,
    datasetDirty,
    datasetEditorVersion,
    historyVersion,
    template,
    datasets,
    materialUnsaved,
    load,
    show,
    save,
    saveDataset,
    clearMaterial,
    captureFrom,
  };
}
