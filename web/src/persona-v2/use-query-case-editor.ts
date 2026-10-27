import { computed, onBeforeUnmount, ref, watch, type ComputedRef, type Ref } from "vue";
import type {
  DatasetCaseOptions,
  DatasetVersionReference,
} from "../../../src/domain/persona-v2/dataset-case-options";
import type { DatasetCaseSeeds } from "../../../src/domain/persona-v2/dataset-case-seeds";
import type { TrainingCase } from "../../../src/domain/persona-v2/catalog";
import {
  queryPublicationCaseSchema,
  type QueryPublicationCase,
} from "../../../src/domain/persona-v2/publication-fixture";
import type { Training } from "./model";
import {
  applyQueryCaseSeeds,
  emptyQueryPublicationCase,
  queryCaseDatasetContextChanged,
  queryCaseDatasetMatches,
  queryCaseErrorMessage,
  queryCaseFingerprint,
} from "./query-case-editor";
import { useErrorSummary } from "./useErrorSummary";

export interface QueryCaseEditorProps {
  training: Training;
  cases: readonly TrainingCase[];
  disabled: boolean;
  confirmDiscard: () => Promise<boolean>;
  loadDatasetSeeds: (dataset?: DatasetVersionReference) => Promise<DatasetCaseSeeds>;
  loadDatasetOptions: (after?: { id: string; version: number }) => Promise<DatasetCaseOptions>;
}

export interface QueryCaseSave {
  id?: string;
  required: boolean;
  remove: boolean;
  content: QueryPublicationCase;
}

export interface QueryCaseEditorEmit {
  (event: "dirty", value: boolean): void;
  (event: "save", value: QueryCaseSave): void;
}

export interface QueryCaseEditorState {
  current: Ref<QueryPublicationCase | undefined>;
  id: Ref<string>;
  required: Ref<boolean>;
  confirmed: Ref<boolean>;
  datasetOrigin: Ref<DatasetCaseSeeds | undefined>;
  datasetOptions: Ref<DatasetCaseOptions | undefined>;
  selectedDataset: Ref<string>;
  loadingSeeds: Ref<boolean>;
  error: Ref<string>;
  errorSummary: Ref<HTMLElement | undefined>;
  dirty: ComputedRef<boolean>;
  edit: (test?: TrainingCase) => Promise<void>;
  close: () => Promise<void>;
  listDatasets: (more?: boolean) => Promise<void>;
  useDatasetSeeds: (dataset?: DatasetVersionReference) => Promise<void>;
  submit: (remove?: boolean) => void;
}

export function useQueryCaseEditor(
  props: QueryCaseEditorProps,
  emit: QueryCaseEditorEmit,
): QueryCaseEditorState {
  const current = ref<QueryPublicationCase>();
  const id = ref("");
  const required = ref(true);
  const saved = ref("");
  const confirmed = ref(false);
  const { error, errorSummary } = useErrorSummary();
  const datasetOrigin = ref<DatasetCaseSeeds>();
  const datasetOptions = ref<DatasetCaseOptions>();
  const selectedDataset = ref("");
  const loadingSeeds = ref(false);
  let live = true;
  onBeforeUnmount(() => {
    live = false;
  });
  const fingerprint = computed(() => queryCaseFingerprint(current.value, required.value));
  const dirty = computed(
    () => !!current.value && (fingerprint.value !== saved.value || confirmed.value),
  );
  watch(dirty, (value) => emit("dirty", value));

  function resetDatasetChoice(): void {
    datasetOrigin.value = undefined;
    datasetOptions.value = undefined;
    selectedDataset.value = "";
  }

  async function edit(test?: TrainingCase): Promise<void> {
    if (dirty.value && !(await props.confirmDiscard())) {
      return;
    }
    error.value = "";
    resetDatasetChoice();
    if (test) {
      const parsed = queryPublicationCaseSchema.safeParse(test.content);
      if (!parsed.success) {
        error.value =
          "Este caso não usa o formato declarativo atual. Preserve o original e revise-o pela API; não há conversão automática.";
        return;
      }
      current.value = parsed.data;
    } else {
      current.value = emptyQueryPublicationCase();
    }
    id.value = test?.id ?? "";
    required.value = test?.required ?? true;
    confirmed.value = false;
    saved.value = fingerprint.value;
  }

  async function close(): Promise<void> {
    if (dirty.value && !(await props.confirmDiscard())) {
      return;
    }
    current.value = undefined;
    resetDatasetChoice();
    confirmed.value = false;
  }

  async function listDatasets(more = false): Promise<void> {
    if (!current.value || props.disabled || loadingSeeds.value) {
      return;
    }
    const target = current.value;
    const previous = datasetOptions.value;
    if (more && !previous?.nextCursor) {
      return;
    }
    loadingSeeds.value = true;
    error.value = "";
    try {
      const result = await props.loadDatasetOptions(
        more ? (previous?.nextCursor ?? undefined) : undefined,
      );
      if (!live || current.value !== target) {
        return;
      }
      if (more && previous && queryCaseDatasetContextChanged(previous, result)) {
        throw new Error(
          "O contexto dos datasets mudou; preserve a edição e consulte a primeira página.",
        );
      }
      datasetOptions.value = result;
      selectedDataset.value = "";
    } catch (cause) {
      if (live && current.value === target) {
        error.value = queryCaseErrorMessage(cause, "Não foi possível listar datasets.");
      }
    } finally {
      loadingSeeds.value = false;
    }
  }

  async function useDatasetSeeds(dataset?: DatasetVersionReference): Promise<void> {
    if (!current.value || props.disabled || loadingSeeds.value) {
      return;
    }
    const target = current.value;
    loadingSeeds.value = true;
    try {
      if (target.input.fixtures.length && !(await props.confirmDiscard())) {
        return;
      }
      if (!live || props.disabled || current.value !== target) {
        return;
      }
      error.value = "";
      const suggestion = await props.loadDatasetSeeds(dataset);
      if (!live || current.value !== target) {
        return;
      }
      if (dataset && !queryCaseDatasetMatches(suggestion, dataset)) {
        throw new Error("A confirmação não corresponde ao dataset escolhido; edição preservada.");
      }
      applyQueryCaseSeeds(target, suggestion);
      datasetOrigin.value = suggestion;
    } catch (cause) {
      if (live && current.value === target) {
        error.value = queryCaseErrorMessage(
          cause,
          "Não foi possível carregar o dataset; sua edição foi preservada.",
        );
      }
    } finally {
      loadingSeeds.value = false;
    }
  }

  function submit(remove = false): void {
    if (!current.value || props.disabled || (remove && !confirmed.value)) {
      return;
    }
    const parsed = queryPublicationCaseSchema.safeParse(current.value);
    if (!parsed.success) {
      error.value =
        "Revise nome, sementes, colunas e valores tipados do resultado esperado. Cada registro deve corresponder às colunas declaradas.";
      return;
    }
    error.value = "";
    emit("save", {
      ...(id.value ? { id: id.value } : {}),
      required: required.value,
      remove,
      content: parsed.data,
    });
  }

  return {
    current,
    id,
    required,
    confirmed,
    datasetOrigin,
    datasetOptions,
    selectedDataset,
    loadingSeeds,
    error,
    errorSummary,
    dirty,
    edit,
    close,
    listDatasets,
    useDatasetSeeds,
    submit,
  };
}
