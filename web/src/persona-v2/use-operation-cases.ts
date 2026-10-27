import { computed, ref, watch, type ComputedRef, type Ref } from "vue";
import type { TrainingCase } from "../../../src/domain/persona-v2/catalog";
import type { OperationTraining } from "./operation-editor";
import {
  applyOperationCaseDataset,
  cloneOperationCase,
  emptyOperationCase,
  isOperationCaseDirty,
  operationCaseFingerprint,
  type OperationCase,
  type OperationCaseDatasetSeeds,
} from "./operation-cases";

export interface OperationCasesPanelProps {
  training: OperationTraining;
  cases: readonly TrainingCase[];
  disabled: boolean;
  confirmDiscard: () => Promise<boolean>;
  api?: <T>(url: string, body?: unknown) => Promise<T>;
  base?: string;
  skillId?: string;
  revision?: number;
}

export interface OperationCaseSave {
  id?: string;
  remove: boolean;
  required: boolean;
  content: OperationCase;
}

export interface OperationCasesPanelEmit {
  (event: "dirty", value: boolean): void;
  (event: "lock", value: boolean): void;
  (event: "save", value: OperationCaseSave): void;
}

export interface OperationCasesState {
  current: Ref<OperationCase | undefined>;
  id: Ref<string>;
  required: Ref<boolean>;
  removeConfirmed: Ref<boolean>;
  dirty: ComputedRef<boolean>;
  edit: (test?: TrainingCase) => Promise<void>;
  close: () => Promise<void>;
  submit: (remove?: boolean) => void;
  applyDataset: (value: OperationCaseDatasetSeeds) => void;
}

export function useOperationCases(
  props: OperationCasesPanelProps,
  emit: OperationCasesPanelEmit,
): OperationCasesState {
  const current = ref<OperationCase>();
  const id = ref("");
  const required = ref(true);
  const saved = ref("");
  const removeConfirmed = ref(false);
  const fingerprint = computed(() => operationCaseFingerprint(required.value, current.value));
  const dirty = computed(() =>
    isOperationCaseDirty({
      current: current.value,
      fingerprint: fingerprint.value,
      saved: saved.value,
      removeConfirmed: removeConfirmed.value,
    }),
  );
  watch(dirty, (value) => emit("dirty", value));

  function applyDataset(value: OperationCaseDatasetSeeds): void {
    if (!current.value || props.disabled) {
      return;
    }
    applyOperationCaseDataset(current.value, value);
  }

  async function edit(test?: TrainingCase): Promise<void> {
    if (dirty.value && !(await props.confirmDiscard())) {
      return;
    }
    id.value = test?.id ?? "";
    required.value = test?.required ?? true;
    removeConfirmed.value = false;
    current.value = test ? cloneOperationCase(test.content) : emptyOperationCase(props.training);
    saved.value = fingerprint.value;
  }

  function submit(remove = false): void {
    if (current.value && (!remove || removeConfirmed.value)) {
      emit("save", {
        ...(id.value ? { id: id.value } : {}),
        remove,
        required: required.value,
        content: current.value,
      });
    }
  }

  async function close(): Promise<void> {
    if (dirty.value && !(await props.confirmDiscard())) {
      return;
    }
    current.value = undefined;
    removeConfirmed.value = false;
  }

  return {
    current,
    id,
    required,
    removeConfirmed,
    dirty,
    edit,
    close,
    submit,
    applyDataset,
  };
}
