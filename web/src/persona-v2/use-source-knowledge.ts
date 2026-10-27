import { computed, onBeforeUnmount, ref, watch, type ComputedRef, type Ref } from "vue";
import type {
  Comparison,
  Content,
  Inspection,
  KnowledgeSelection,
  ProfilePage,
} from "./knowledge-model";
import type { Source, Training } from "./model";
import type { OperationTraining } from "./operation-editor";
import {
  emptyProfilePage,
  sourceKnowledgeConfirmLabel,
  sourceKnowledgeDirty,
  sourceKnowledgeErrorMessage,
  sourceKnowledgeInspectionContent,
  sourceKnowledgeSectionLabel,
  sourceKnowledgeSelectionChangeNeedsDiscard,
  sourceKnowledgeSelectionKey,
  sourceKnowledgeTitle,
} from "./source-knowledge";
import { useSourceKnowledgeAdoption } from "./use-source-knowledge-adoption";
import { useErrorSummary } from "./useErrorSummary";

export interface SourceKnowledgeProps {
  sources: Source[];
  personaBase: string;
  api: <T>(url: string, body?: unknown) => Promise<T>;
  disabled: boolean;
  confirmDiscard: () => Promise<boolean>;
  initialSourceId?: string;
  registration?: boolean;
  training?: Training;
  operationTraining?: OperationTraining;
}

export interface SourceKnowledgeEmit {
  (event: "dirty", value: boolean): void;
  (event: "lock", value: boolean): void;
  (event: "training", value: Training): void;
  (event: "operationTraining", value: OperationTraining): void;
}

export interface SourceKnowledgeState {
  sourceId: Ref<string>;
  source: ComputedRef<Source | undefined>;
  sourceBase: ComputedRef<string>;
  selection: Ref<KnowledgeSelection | undefined>;
  inspection: Ref<Inspection | undefined>;
  comparison: Ref<Comparison | undefined>;
  page: Ref<ProfilePage>;
  curator: Ref<boolean>;
  curationDirty: Ref<boolean>;
  reviewDirty: Ref<boolean>;
  inspectionDirty: Ref<boolean>;
  profileDirty: Ref<boolean>;
  pendingAdoption: Ref<boolean>;
  busy: Ref<boolean>;
  profileKey: Ref<number>;
  workspaceKey: Ref<number>;
  tables: Ref<string[]>;
  fields: Ref<string[]>;
  confirmed: Ref<boolean>;
  message: Ref<string>;
  error: Ref<string>;
  errorSummary: Ref<HTMLElement | undefined>;
  dirty: ComputedRef<boolean>;
  content: ComputedRef<Content | undefined>;
  selectionKey: ComputedRef<string>;
  inspectionContent: ComputedRef<Content | undefined>;
  draftTraining: ComputedRef<Training | OperationTraining | undefined>;
  sectionLabel: ComputedRef<string>;
  title: ComputedRef<string>;
  confirmLabel: ComputedRef<string>;
  chooseSource: (event: Event) => Promise<void>;
  discardPending: () => Promise<void>;
  beforeSelectionChange: () => Promise<boolean>;
  compare: () => Promise<void>;
  apply: () => void;
  removeReference: () => void;
  markTouched: () => void;
}

export function useSourceKnowledge(
  props: SourceKnowledgeProps,
  emit: SourceKnowledgeEmit,
): SourceKnowledgeState {
  const draftTraining = computed(() => props.operationTraining ?? props.training);
  const sourceId = ref(draftTraining.value?.sourceId ?? props.initialSourceId ?? "");
  const source = computed(() => props.sources.find((item) => item.id === sourceId.value));
  const sourceBase = computed(() => `${props.personaBase}/fontes/${sourceId.value}`);
  const selection = ref<KnowledgeSelection>();
  const inspection = ref<Inspection>();
  const page = ref<ProfilePage>(emptyProfilePage());
  const curator = ref(false);
  const curationDirty = ref(false);
  const reviewDirty = ref(false);
  const inspectionDirty = ref(false);
  const profileDirty = ref(false);
  const busy = ref(false);
  const profileKey = ref(0);
  const workspaceKey = ref(0);
  const message = ref("");
  const { error, errorSummary } = useErrorSummary();
  let live = true;
  let epoch = 0;
  const content = computed(
    () => selection.value?.profile?.content ?? selection.value?.standard.content,
  );
  const selectionKey = computed(() => sourceKnowledgeSelectionKey(selection.value));
  const sectionLabel = computed(() =>
    sourceKnowledgeSectionLabel({
      hasOperation: !!props.operationTraining,
      hasDraft: !!draftTraining.value,
    }),
  );
  const title = computed(() =>
    sourceKnowledgeTitle({
      hasDraft: !!draftTraining.value,
      hasOperation: !!props.operationTraining,
      registration: props.registration === true,
    }),
  );
  const confirmLabel = computed(() => sourceKnowledgeConfirmLabel(!!props.operationTraining));

  function bumpEpoch(): void {
    epoch++;
  }

  async function run(
    action: (isCurrent: () => boolean) => Promise<void>,
    fallback: string,
  ): Promise<void> {
    if (busy.value || props.disabled) {
      return;
    }
    const version = epoch;
    busy.value = true;
    emit("lock", true);
    error.value = "";
    try {
      await action(() => live && epoch === version);
    } catch (cause) {
      if (live && epoch === version) {
        error.value = sourceKnowledgeErrorMessage(cause, fallback);
      }
    } finally {
      if (live) {
        busy.value = false;
      }
      emit("lock", false);
    }
  }

  const adoption = useSourceKnowledgeAdoption({
    props,
    emit,
    sourceBase,
    selection,
    inspection,
    selectionKey,
    draftTraining,
    content,
    error,
    message,
    run,
    bumpEpoch,
  });
  const dirty = computed(() =>
    sourceKnowledgeDirty({
      inspectionDirty: inspectionDirty.value,
      profileDirty: profileDirty.value,
      pendingAdoption: adoption.pendingAdoption.value,
      curationDirty: curationDirty.value,
      reviewDirty: reviewDirty.value,
    }),
  );
  const inspectionContent = computed(() =>
    sourceKnowledgeInspectionContent(content.value, adoption.tables.value, !!draftTraining.value),
  );
  watch(
    () => props.initialSourceId,
    (value) => {
      if (!sourceId.value && !dirty.value && value) {
        sourceId.value = value;
      }
    },
  );
  watch(dirty, (value) => emit("dirty", value), { immediate: true });
  onBeforeUnmount(() => {
    live = false;
    epoch++;
    emit("dirty", false);
  });
  watch(
    () => draftTraining.value?.sourceId,
    (value) => {
      if (value !== undefined && value !== sourceId.value) {
        sourceId.value = value;
        reset();
      }
    },
  );

  function reset(): void {
    epoch++;
    selection.value = undefined;
    inspection.value = undefined;
    page.value = emptyProfilePage();
    inspectionDirty.value = false;
    profileDirty.value = false;
    curationDirty.value = false;
    reviewDirty.value = false;
    adoption.reset();
    workspaceKey.value++;
    message.value = "";
    error.value = "";
  }

  async function chooseSource(event: Event): Promise<void> {
    const input = event.target as HTMLSelectElement;
    if (dirty.value && !(await props.confirmDiscard())) {
      input.value = sourceId.value;
      return;
    }
    sourceId.value = input.value;
    reset();
  }

  async function discardPending(): Promise<void> {
    if (dirty.value && !(await props.confirmDiscard())) {
      return;
    }
    reset();
  }

  async function beforeSelectionChange(): Promise<boolean> {
    if (
      sourceKnowledgeSelectionChangeNeedsDiscard({
        profileDirty: profileDirty.value,
        curationDirty: curationDirty.value,
        reviewDirty: reviewDirty.value,
        pendingAdoption: adoption.pendingAdoption.value,
        selectedTableCount: adoption.tables.value.length,
      }) &&
      !(await props.confirmDiscard())
    ) {
      return false;
    }
    profileKey.value++;
    profileDirty.value = false;
    adoption.pendingAdoption.value = false;
    return true;
  }

  return {
    sourceId,
    source,
    sourceBase,
    selection,
    inspection,
    comparison: adoption.comparison,
    page,
    curator,
    curationDirty,
    reviewDirty,
    inspectionDirty,
    profileDirty,
    pendingAdoption: adoption.pendingAdoption,
    busy,
    profileKey,
    workspaceKey,
    tables: adoption.tables,
    fields: adoption.fields,
    confirmed: adoption.confirmed,
    message,
    error,
    errorSummary,
    dirty,
    content,
    selectionKey,
    inspectionContent,
    draftTraining,
    sectionLabel,
    title,
    confirmLabel,
    chooseSource,
    discardPending,
    beforeSelectionChange,
    compare: adoption.compare,
    apply: adoption.apply,
    removeReference: adoption.removeReference,
    markTouched: adoption.markTouched,
  };
}
