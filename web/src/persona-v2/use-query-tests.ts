import { onBeforeUnmount, ref, watch, type Ref } from "vue";
import type { OperationTestDetails } from "../../../src/domain/persona-v2/catalog";
import {
  datasetCaseOptionsSchema,
  type DatasetCaseOptions,
  type DatasetVersionReference,
} from "../../../src/domain/persona-v2/dataset-case-options";
import {
  datasetCaseSeedsSchema,
  type DatasetCaseSeeds,
} from "../../../src/domain/persona-v2/dataset-case-seeds";
import type { QueryPublicationCase } from "../../../src/domain/persona-v2/publication-fixture";
import type { Training } from "./model";
import {
  appendQueryTestReports,
  queryTestsChangedMessage,
  queryTestsDatasetContextMatches,
  queryTestsDatasetContextMessage,
  queryTestsDatasetListBusyMessage,
  queryTestsDatasetSeedsBusyMessage,
  queryTestsDatasetSeedsContextMessage,
  queryTestsPageConflicts,
  queryTestsReadError,
  queryTestsSaveError,
  queryTestsSavedMessage,
} from "./query-tests";
import { useErrorSummary } from "./useErrorSummary";

export interface QueryTestsPanelProps {
  root: string;
  revision: number;
  disabled: boolean;
  training: Training;
  confirmDiscard: () => Promise<boolean>;
  api: <T>(url: string, body?: unknown) => Promise<T>;
}

export interface QueryTestsPanelEmit {
  (event: "dirty", value: boolean): void;
  (event: "lock", value: boolean): void;
  (event: "saved", value: number): void;
}

export interface QueryTestsState {
  editorKey: Ref<number>;
  caseDirty: Ref<boolean>;
  message: Ref<string>;
  details: Ref<OperationTestDetails | undefined>;
  busy: Ref<boolean>;
  error: Ref<string>;
  errorSummary: Ref<HTMLElement | undefined>;
  load: (more?: boolean) => Promise<void>;
  loadDatasetOptions: (after?: { id: string; version: number }) => Promise<DatasetCaseOptions>;
  loadDatasetSeeds: (dataset?: DatasetVersionReference) => Promise<DatasetCaseSeeds>;
  save: (value: {
    id?: string;
    required: boolean;
    remove: boolean;
    content: QueryPublicationCase;
  }) => Promise<void>;
}

export function useQueryTests(
  props: QueryTestsPanelProps,
  emit: QueryTestsPanelEmit,
): QueryTestsState {
  const editorKey = ref(0);
  const caseDirty = ref(false);
  const message = ref("");
  const details = ref<OperationTestDetails>();
  const busy = ref(false);
  const { error, errorSummary } = useErrorSummary();
  let epoch = 0;
  watch(caseDirty, (value) => emit("dirty", value));
  watch(
    () => [props.root, props.revision, props.disabled],
    (next, previous) => {
      if (busy.value) {
        return;
      }
      if (!props.disabled && next[0] === previous?.[0] && next[1] === previous?.[1]) {
        return;
      }
      epoch++;
      busy.value = false;
      details.value = undefined;
      error.value = "";
    },
  );
  watch(
    () => props.root,
    () => {
      epoch++;
    },
  );
  onBeforeUnmount(() => {
    epoch++;
  });

  async function load(more = false): Promise<void> {
    if (busy.value || props.disabled) {
      return;
    }
    const run = ++epoch;
    const previous = details.value;
    busy.value = true;
    emit("lock", true);
    error.value = "";
    try {
      const cursor = more ? previous?.nextCursor : undefined;
      const result = await props.api<OperationTestDetails>(
        `${props.root}/testes-consulta${cursor ? `?after=${encodeURIComponent(cursor)}` : ""}`,
      );
      if (run !== epoch) {
        return;
      }
      if (
        queryTestsPageConflicts({
          result,
          revision: props.revision,
          more,
          previous,
        })
      ) {
        details.value = undefined;
        throw new Error(queryTestsChangedMessage);
      }
      details.value = more && previous ? appendQueryTestReports(previous, result) : result;
    } catch (cause) {
      if (run === epoch) {
        details.value = undefined;
        error.value = queryTestsReadError(cause);
      }
    } finally {
      if (run === epoch) {
        busy.value = false;
      }
      emit("lock", false);
    }
  }

  async function loadDatasetOptions(after?: {
    id: string;
    version: number;
  }): Promise<DatasetCaseOptions> {
    if (busy.value || props.disabled) {
      throw new Error(queryTestsDatasetListBusyMessage);
    }
    const run = ++epoch;
    busy.value = true;
    emit("lock", true);
    try {
      const parsed = datasetCaseOptionsSchema.safeParse(
        await props.api<unknown>(`${props.root}/datasets-caso`, {
          expectedRevision: props.revision,
          ...(after ? { after } : {}),
        }),
      );
      if (!parsed.success) {
        throw new Error("Não foi possível confirmar a lista de datasets; a edição foi preservada.");
      }
      const result = parsed.data;
      if (
        run !== epoch ||
        !queryTestsDatasetContextMatches(result, props.revision, props.training.sourceId)
      ) {
        throw new Error(queryTestsDatasetContextMessage);
      }
      return result;
    } finally {
      busy.value = false;
      emit("lock", false);
    }
  }

  async function loadDatasetSeeds(dataset?: DatasetVersionReference): Promise<DatasetCaseSeeds> {
    if (busy.value || props.disabled) {
      throw new Error(queryTestsDatasetSeedsBusyMessage);
    }
    const run = ++epoch;
    busy.value = true;
    emit("lock", true);
    try {
      const result = datasetCaseSeedsSchema.parse(
        await props.api<unknown>(`${props.root}/sementes-dataset`, {
          expectedRevision: props.revision,
          ...(dataset ? { dataset } : {}),
        }),
      );
      if (
        run !== epoch ||
        !queryTestsDatasetContextMatches(result, props.revision, props.training.sourceId)
      ) {
        throw new Error(queryTestsDatasetSeedsContextMessage);
      }
      return result;
    } finally {
      busy.value = false;
      emit("lock", false);
    }
  }

  async function save(value: {
    id?: string;
    required: boolean;
    remove: boolean;
    content: QueryPublicationCase;
  }): Promise<void> {
    if (busy.value || props.disabled) {
      return;
    }
    const run = ++epoch;
    busy.value = true;
    emit("lock", true);
    error.value = "";
    message.value = "";
    try {
      const result = await props.api<{ revision: number }>(`${props.root}/casos-consulta`, {
        ...value,
        expectedRevision: props.revision,
      });
      if (run !== epoch) {
        return;
      }
      caseDirty.value = false;
      editorKey.value++;
      details.value = undefined;
      emit("saved", result.revision);
      message.value = queryTestsSavedMessage;
    } catch (cause) {
      if (run === epoch) {
        error.value = queryTestsSaveError(cause);
      }
    } finally {
      busy.value = false;
      emit("lock", false);
    }
  }

  return {
    editorKey,
    caseDirty,
    message,
    details,
    busy,
    error,
    errorSummary,
    load,
    loadDatasetOptions,
    loadDatasetSeeds,
    save,
  };
}
