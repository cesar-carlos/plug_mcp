import { computed, onBeforeUnmount, ref, watch, type ComputedRef, type Ref } from "vue";
import type { StructureContent } from "../../../src/domain/persona-v2/shared-knowledge";
import type { LibraryPayload } from "../../../src/application/persona-v2/knowledge-library-schema";
import type { ImportedDraftReference } from "./model";
import { useErrorSummary } from "./useErrorSummary";
import {
  libraryDatasetEditorBlocked,
  libraryDestinationFilled,
  libraryPanelDirty,
  type LibraryItem,
  type LibrarySource,
} from "./library-panel";
import { useLibraryDdl } from "./use-library-ddl";
import { useLibraryDraft } from "./use-library-draft";
import { useLibraryMaterial } from "./use-library-material";

export interface LibraryPanelProps {
  catalogId: string;
  content: unknown;
  api: <T>(url: string, body?: unknown) => Promise<T>;
  disabled: boolean;
  confirmDiscard: () => Promise<boolean>;
}

export interface LibraryPanelEmit {
  (event: "dirty", value: boolean): void;
  (event: "lock", value: boolean): void;
  (event: "imported", value: StructureContent): void;
  (event: "openDraft", value: ImportedDraftReference): void;
}

export interface LibraryPanelState {
  createdDraft: Ref<ImportedDraftReference | undefined>;
  items: Ref<LibraryItem[]>;
  cursor: Ref<string | null>;
  selected: Ref<LibraryItem | undefined>;
  payload: Ref<string>;
  slug: Ref<string>;
  name: Ref<string>;
  datasetDirty: Ref<boolean>;
  datasetEditorVersion: Ref<number>;
  historyVersion: Ref<number>;
  datasetId: Ref<string>;
  ddl: Ref<string>;
  system: Ref<string>;
  label: Ref<string>;
  dialect: Ref<string>;
  declaration: Ref<{ content: StructureContent; warnings: string[] } | undefined>;
  personas: Ref<{ id: string; name: string }[]>;
  personaId: Ref<string>;
  sources: Ref<LibrarySource[]>;
  sourceId: Ref<string>;
  chosenDialect: Ref<string>;
  exampleId: Ref<string>;
  additionalExampleIds: Ref<string[]>;
  skillSlug: Ref<string>;
  skillName: Ref<string>;
  error: Ref<string>;
  errorSummary: Ref<HTMLElement | undefined>;
  message: Ref<string>;
  busy: Ref<boolean>;
  template: ComputedRef<StructureContent | undefined>;
  additionalExamples: ComputedRef<StructureContent["examples"]>;
  datasets: ComputedRef<LibraryItem[]>;
  materialUnsaved: ComputedRef<boolean>;
  destinationFilled: ComputedRef<boolean>;
  datasetEditorBlocked: ComputedRef<boolean>;
  load: (more?: boolean) => Promise<void>;
  choose: (item: LibraryItem, version?: number) => Promise<void>;
  fresh: () => Promise<void>;
  capture: () => Promise<void>;
  save: () => Promise<void>;
  saveDataset: (input: { slug: string; name: string; payload: LibraryPayload }) => Promise<void>;
  parseDdl: () => Promise<void>;
  readDdl: (event: Event) => Promise<void>;
  loadPersonas: () => Promise<void>;
  loadSources: () => Promise<void>;
  apply: () => Promise<void>;
  consultVersion: () => Promise<void>;
  useDeclarations: () => void;
}

export function useLibraryPanel(
  props: LibraryPanelProps,
  emit: LibraryPanelEmit,
): LibraryPanelState {
  const busy = ref(false);
  const message = ref("");
  const { error, errorSummary } = useErrorSummary();
  let live = true;
  function isLive(): boolean {
    return live;
  }
  const root = computed(() => `/api/admin/catalogos/${props.catalogId}`);
  async function run(action: () => Promise<void>): Promise<void> {
    if (busy.value || props.disabled) {
      return;
    }
    busy.value = true;
    emit("lock", true);
    error.value = "";
    message.value = "";
    try {
      await action();
    } catch (cause) {
      if (live) {
        error.value = cause instanceof Error ? cause.message : "Biblioteca indisponível.";
      }
    } finally {
      busy.value = false;
      emit("lock", false);
    }
  }
  let clearDestination = (): void => undefined;
  const material = useLibraryMaterial({
    api: props.api,
    run,
    isLive,
    root,
    message,
    onShow: () => clearDestination(),
  });
  const draft = useLibraryDraft({
    catalogId: props.catalogId,
    api: props.api,
    run,
    isLive,
    selected: material.selected,
    datasets: material.datasets,
    template: material.template,
    message,
  });
  clearDestination = () => draft.clearDestination();
  const ddlState = useLibraryDdl({
    api: props.api,
    run,
    isLive,
    root,
    confirmDiscard: () => props.confirmDiscard(),
    emitImported: (content) => emit("imported", content),
  });
  const destinationFilled = computed(() =>
    libraryDestinationFilled({
      ddl: ddlState.ddl.value,
      system: ddlState.system.value,
      label: ddlState.label.value,
      personaId: draft.personaId.value,
      sourceId: draft.sourceId.value,
      chosenDialect: draft.chosenDialect.value,
      exampleId: draft.exampleId.value,
      additionalExampleIds: draft.additionalExampleIds.value,
      datasetId: draft.datasetId.value,
      skillSlug: draft.skillSlug.value,
      skillName: draft.skillName.value,
    }),
  );
  const dirty = computed(() =>
    libraryPanelDirty({
      datasetDirty: material.datasetDirty.value,
      payload: material.payload.value,
      slug: material.slug.value,
      name: material.name.value,
      saved: material.saved.value,
      ddl: ddlState.ddl.value,
      system: ddlState.system.value,
      label: ddlState.label.value,
      personaId: draft.personaId.value,
      sourceId: draft.sourceId.value,
      chosenDialect: draft.chosenDialect.value,
      exampleId: draft.exampleId.value,
      additionalExampleIds: draft.additionalExampleIds.value,
      datasetId: draft.datasetId.value,
      skillSlug: draft.skillSlug.value,
      skillName: draft.skillName.value,
    }),
  );
  const datasetEditorBlocked = computed(() =>
    libraryDatasetEditorBlocked({
      disabled: props.disabled,
      busy: busy.value,
      materialUnsaved: material.materialUnsaved.value,
      ddl: ddlState.ddl.value,
      system: ddlState.system.value,
      label: ddlState.label.value,
      personaId: draft.personaId.value,
      sourceId: draft.sourceId.value,
      chosenDialect: draft.chosenDialect.value,
      exampleId: draft.exampleId.value,
      datasetId: draft.datasetId.value,
      skillSlug: draft.skillSlug.value,
      skillName: draft.skillName.value,
    }),
  );
  watch(dirty, (value) => emit("dirty", value), { immediate: true });
  onBeforeUnmount(() => {
    live = false;
    emit("dirty", false);
    emit("lock", false);
  });
  async function choose(item: LibraryItem, version?: number): Promise<void> {
    if (dirty.value && !(await props.confirmDiscard())) {
      return;
    }
    await run(async () => {
      const data = await props.api<LibraryItem>(
        `${root.value}/biblioteca/${item.id}` + (version ? `?version=${version}` : ""),
      );
      if (live) {
        material.show(data);
        ddlState.ddl.value = "";
        ddlState.system.value = "";
        ddlState.label.value = "";
        draft.skillSlug.value = "";
        draft.skillName.value = "";
        ddlState.declaration.value = undefined;
      }
    });
  }
  async function consultVersion(): Promise<void> {
    if (!material.selected.value) {
      return;
    }
    await choose(material.selected.value, material.historyVersion.value);
  }
  async function fresh(): Promise<void> {
    if (dirty.value && !(await props.confirmDiscard())) {
      return;
    }
    material.clearMaterial();
    draft.skillSlug.value = "";
    draft.skillName.value = "";
    ddlState.clearDdl();
    draft.clearDestination();
  }
  async function capture(): Promise<void> {
    if (dirty.value && !(await props.confirmDiscard())) {
      return;
    }
    material.captureFrom(props.content);
    draft.clearDestination();
  }
  return {
    createdDraft: draft.createdDraft,
    items: material.items,
    cursor: material.cursor,
    selected: material.selected,
    payload: material.payload,
    slug: material.slug,
    name: material.name,
    datasetDirty: material.datasetDirty,
    datasetEditorVersion: material.datasetEditorVersion,
    historyVersion: material.historyVersion,
    datasetId: draft.datasetId,
    ddl: ddlState.ddl,
    system: ddlState.system,
    label: ddlState.label,
    dialect: ddlState.dialect,
    declaration: ddlState.declaration,
    personas: draft.personas,
    personaId: draft.personaId,
    sources: draft.sources,
    sourceId: draft.sourceId,
    chosenDialect: draft.chosenDialect,
    exampleId: draft.exampleId,
    additionalExampleIds: draft.additionalExampleIds,
    skillSlug: draft.skillSlug,
    skillName: draft.skillName,
    error,
    errorSummary,
    message,
    busy,
    template: material.template,
    additionalExamples: draft.additionalExamples,
    datasets: material.datasets,
    materialUnsaved: material.materialUnsaved,
    destinationFilled,
    datasetEditorBlocked,
    load: material.load,
    choose,
    fresh,
    capture,
    save: material.save,
    saveDataset: material.saveDataset,
    parseDdl: ddlState.parseDdl,
    readDdl: ddlState.readDdl,
    loadPersonas: draft.loadPersonas,
    loadSources: draft.loadSources,
    apply: draft.apply,
    consultVersion,
    useDeclarations: ddlState.useDeclarations,
  };
}
