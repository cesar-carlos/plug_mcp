import {
  computed,
  onBeforeUnmount,
  onScopeDispose,
  ref,
  watch,
  type ComputedRef,
  type Ref,
} from "vue";
import type { StructureContent } from "../../../src/domain/persona-v2/shared-knowledge";
import type { ImportedDraftReference } from "./model";
import {
  catalogCreateHasPendingWork,
  catalogFormsDirty,
  catalogImportedDdlHasPendingWork,
  catalogMayEdit,
  catalogMayPublish,
  catalogRoot,
  type Catalog,
  type CatalogComparison,
  type CatalogMember,
  type CatalogPattern,
  type CatalogPreview,
  type CatalogPublication,
} from "./catalog-panel";
import { useCatalogHistory } from "./use-catalog-history";
import { useCatalogMembers } from "./use-catalog-members";
import { useCatalogPatternEditor } from "./use-catalog-pattern-editor";

export interface CatalogPanelProps {
  api: <T>(url: string, body?: unknown) => Promise<T>;
  disabled: boolean;
  confirmDiscard: () => Promise<boolean>;
}

export interface CatalogPanelEmit {
  (event: "dirty", value: boolean): void;
  (event: "lock", value: boolean): void;
  (event: "openDraft", value: ImportedDraftReference): void;
}

export interface CatalogPanelState {
  catalogs: Ref<Catalog[]>;
  catalogId: Ref<string>;
  catalogName: Ref<string>;
  patterns: Ref<CatalogPattern[]>;
  publications: Ref<CatalogPublication[]>;
  busy: Ref<boolean>;
  error: Ref<string>;
  message: Ref<string>;
  patternId: Ref<string>;
  slug: Ref<string>;
  name: Ref<string>;
  content: Ref<unknown>;
  reviewDate: Ref<string>;
  preview: Ref<CatalogPreview | undefined>;
  confirmed: Ref<boolean>;
  libraryDirty: Ref<boolean>;
  libraryKey: Ref<number>;
  curationDirty: Ref<boolean>;
  curationKey: Ref<number>;
  clientId: Ref<string>;
  role: Ref<string>;
  members: Ref<CatalogMember[]>;
  versions: Ref<CatalogPublication[]>;
  historyPatternId: Ref<string>;
  nextCursor: Ref<string | null>;
  beforeId: Ref<string>;
  afterId: Ref<string>;
  comparison: Ref<CatalogComparison | undefined>;
  catalog: ComputedRef<Catalog | undefined>;
  mayEdit: ComputedRef<boolean>;
  mayPublish: ComputedRef<boolean>;
  dirty: ComputedRef<boolean>;
  catalogPath: ComputedRef<string>;
  run: (action: () => Promise<void>) => Promise<void>;
  refresh: () => Promise<void>;
  chooseCatalog: (event: Event) => Promise<void>;
  createCatalog: () => Promise<void>;
  edit: (pattern: CatalogPattern) => Promise<void>;
  importedDdl: (value: StructureContent) => Promise<void>;
  curationUpdated: (id: string) => Promise<void>;
  newPattern: () => Promise<void>;
  importFile: (event: Event) => Promise<void>;
  save: () => Promise<void>;
  prepare: () => Promise<void>;
  publish: () => Promise<void>;
  setMember: () => Promise<void>;
  history: (id: string, cursor?: string) => Promise<void>;
  compare: () => Promise<void>;
  suspend: (publication: CatalogPublication) => Promise<void>;
  onReviewDirty: (id: string, value: boolean) => void;
}

export function useCatalogPanel(
  props: CatalogPanelProps,
  emit: CatalogPanelEmit,
): CatalogPanelState {
  const catalogs = ref<Catalog[]>([]);
  const catalogId = ref("");
  const catalogName = ref("");
  const patterns = ref<CatalogPattern[]>([]);
  const publications = ref<CatalogPublication[]>([]);
  const busy = ref(false);
  const error = ref("");
  const message = ref("");
  const curationDirty = ref(false);
  const libraryDirty = ref(false);
  const libraryKey = ref(0);
  const curationKey = ref(0);
  const catalog = computed(() => catalogs.value.find((item) => item.id === catalogId.value));
  const mayEdit = computed(() => catalogMayEdit(catalog.value?.role));
  const mayPublish = computed(() => catalogMayPublish(catalog.value?.role));
  const catalogPath = computed(() => catalogRoot(catalogId.value));
  let live = true;
  function isLive(): boolean {
    return live;
  }
  async function run(action: () => Promise<void>): Promise<void> {
    if (!live || busy.value || props.disabled) {
      return;
    }
    busy.value = true;
    error.value = "";
    message.value = "";
    try {
      await action();
    } catch (cause) {
      if (live) {
        error.value = cause instanceof Error ? cause.message : "Não foi possível concluir.";
      }
    } finally {
      busy.value = false;
    }
  }
  const editor = useCatalogPatternEditor({
    api: props.api,
    run,
    isLive,
    catalogPath,
    confirmDiscard: () => props.confirmDiscard(),
    refresh: () => refresh(),
    message,
  });
  const historyState = useCatalogHistory({
    api: props.api,
    run,
    isLive,
    catalogPath,
    confirmDiscard: () => props.confirmDiscard(),
    refresh: () => refresh(),
    message,
    onSuspended: editor.clearPublicationPreview,
  });
  const membersState = useCatalogMembers({
    api: props.api,
    run,
    isLive,
    catalogPath,
    catalog,
    refresh: () => refresh(),
    message,
    onGranted: editor.clearPublicationPreview,
  });
  const formsDirty = computed(() =>
    catalogFormsDirty({
      editorDirty: editor.dirty.value,
      catalogName: catalogName.value,
      clientId: membersState.clientId.value,
      curationDirty: curationDirty.value,
      libraryDirty: libraryDirty.value,
      reviewDirty: historyState.reviewDirty.value,
      reviewDate: editor.reviewDate.value,
    }),
  );
  watch(formsDirty, (value) => emit("dirty", value));
  watch(busy, (value) => emit("lock", value), { flush: "sync" });
  function release(): void {
    live = false;
    emit("dirty", false);
    emit("lock", false);
  }
  onBeforeUnmount(release);
  onScopeDispose(release);
  async function refresh(): Promise<void> {
    const result = await props.api<{ catalogs: Catalog[] }>("/api/admin/catalogos");
    if (!live) {
      return;
    }
    catalogs.value = result.catalogs;
    if (catalogId.value && !catalog.value) {
      catalogId.value = "";
      patterns.value = [];
      publications.value = [];
      membersState.clearMembers();
      editor.resetEditor();
      historyState.resetHistory();
      throw new Error("O acesso ao catálogo mudou. Selecione um catálogo disponível.");
    }
    if (catalogId.value) {
      const data = await props.api<{
        patterns?: CatalogPattern[];
        publications?: CatalogPublication[];
      }>(`${catalogPath.value}/padroes`);
      if (live) {
        patterns.value = data.patterns ?? [];
        publications.value = data.publications ?? [];
      }
      await membersState.loadMembers();
    }
  }
  async function chooseCatalog(event: Event): Promise<void> {
    const selected = (event.target as HTMLSelectElement).value;
    if (formsDirty.value && !(await props.confirmDiscard())) {
      (event.target as HTMLSelectElement).value = catalogId.value;
      return;
    }
    catalogId.value = selected;
    libraryDirty.value = false;
    libraryKey.value++;
    curationDirty.value = false;
    curationKey.value++;
    patterns.value = [];
    publications.value = [];
    membersState.clearMembers();
    editor.resetEditor();
    historyState.resetHistory();
    void run(refresh);
  }
  async function createCatalog(): Promise<void> {
    if (
      catalogCreateHasPendingWork({
        editorDirty: editor.dirty.value,
        libraryDirty: libraryDirty.value,
        curationDirty: curationDirty.value,
        reviewDate: editor.reviewDate.value,
        reviewDirty: historyState.reviewDirty.value,
      }) &&
      !(await props.confirmDiscard())
    ) {
      return;
    }
    await run(async () => {
      const result = await props.api<{ catalog: Catalog }>("/api/admin/catalogos", {
        name: catalogName.value,
      });
      if (!live) {
        return;
      }
      catalogId.value = result.catalog.id;
      curationDirty.value = false;
      curationKey.value++;
      catalogName.value = "";
      editor.resetEditor();
      historyState.resetHistory();
      await refresh();
      message.value = "Catálogo privado criado. Conceda acesso para compartilhar.";
    });
  }
  async function importedDdl(value: StructureContent): Promise<void> {
    if (
      catalogImportedDdlHasPendingWork({
        editorDirty: editor.dirty.value,
        libraryDirty: libraryDirty.value,
        reviewDate: editor.reviewDate.value,
      }) &&
      !(await props.confirmDiscard())
    ) {
      return;
    }
    editor.resetEditor();
    editor.content.value = value;
    libraryDirty.value = false;
    libraryKey.value++;
    message.value =
      "Declarações aplicadas somente ao novo rascunho em edição. Revise grão, significado e classificação antes de salvar; a adoção exige inspeção.";
  }
  async function curationUpdated(id: string): Promise<void> {
    await refresh();
    if (editor.patternId.value === id && !editor.dirty.value) {
      const current = patterns.value.find((pattern) => pattern.id === id);
      if (current) {
        await editor.edit(current);
      }
    }
  }
  return {
    catalogs,
    catalogId,
    catalogName,
    patterns,
    publications,
    busy,
    error,
    message,
    patternId: editor.patternId,
    slug: editor.slug,
    name: editor.name,
    content: editor.content,
    reviewDate: editor.reviewDate,
    preview: editor.preview,
    confirmed: editor.confirmed,
    libraryDirty,
    libraryKey,
    curationDirty,
    curationKey,
    clientId: membersState.clientId,
    role: membersState.role,
    members: membersState.members,
    versions: historyState.versions,
    historyPatternId: historyState.historyPatternId,
    nextCursor: historyState.nextCursor,
    beforeId: historyState.beforeId,
    afterId: historyState.afterId,
    comparison: historyState.comparison,
    catalog,
    mayEdit,
    mayPublish,
    dirty: editor.dirty,
    catalogPath,
    run,
    refresh,
    chooseCatalog,
    createCatalog,
    edit: editor.edit,
    importedDdl,
    curationUpdated,
    newPattern: editor.newPattern,
    importFile: editor.importFile,
    save: editor.save,
    prepare: editor.prepare,
    publish: editor.publish,
    setMember: membersState.setMember,
    history: historyState.history,
    compare: historyState.compare,
    suspend: historyState.suspend,
    onReviewDirty: historyState.onReviewDirty,
  };
}
