import { computed, ref, watch, type ComputedRef, type Ref } from "vue";
import type { TrainingCase } from "../../../src/domain/persona-v2/catalog";
import type { DatasetCompositionSeeds } from "../../../src/domain/persona-v2/dataset-composition";
import type { FederationDatasetSeeds } from "../../../src/domain/persona-v2/federation-dataset";
import {
  federationEditableCaseSchema,
  type FederationCase,
  type FederationPublicationCase,
  type FederationTraining,
} from "../../../src/domain/persona-v2/federation-training";
import type { QueryDependency } from "./federation-editor";
import {
  emptyFederationEditableCase,
  federationCaseExpectedResult,
  federationCaseIsNative,
  federationDatasetDependencies,
  federationDatasetSeedApplication,
  type FederationCaseErrorCode,
  type FederationCaseMode,
  type FederationEditableCase,
} from "./federation-case-editor";
import { useErrorSummary } from "./useErrorSummary";

export interface FederationCasesPanelProps {
  training: FederationTraining;
  publications: QueryDependency[];
  cases: readonly TrainingCase[];
  disabled: boolean;
  confirmDiscard: () => Promise<boolean>;
  api?: <T>(url: string, body?: unknown) => Promise<T>;
  base?: string;
  skillId?: string;
  revision?: number;
}

export interface FederationCaseSave {
  id?: string;
  remove: boolean;
  required: boolean;
  content: FederationCase | FederationPublicationCase;
}

export interface FederationCasesPanelEmit {
  (event: "dirty", value: boolean): void;
  (event: "lock", value: boolean): void;
  (event: "save", value: FederationCaseSave): void;
}

export interface FederationCasesState {
  current: Ref<FederationEditableCase | undefined>;
  id: Ref<string>;
  required: Ref<boolean>;
  removeConfirmed: Ref<boolean>;
  resetConfirmed: Ref<boolean>;
  mode: Ref<FederationCaseMode>;
  datasetPublications: Ref<Record<string, string>>;
  changed: ComputedRef<boolean>;
  error: Ref<string>;
  errorSummary: Ref<HTMLElement | undefined>;
  edit: (test?: TrainingCase) => Promise<void>;
  close: () => Promise<void>;
  submit: (remove?: boolean) => void;
  resetPlan: () => void;
  expectedChange: (event: Event) => void;
  applyDataset: (value: FederationDatasetSeeds | DatasetCompositionSeeds) => void;
}

export function useFederationCases(
  props: FederationCasesPanelProps,
  emit: FederationCasesPanelEmit,
): FederationCasesState {
  const current = ref<FederationEditableCase>();
  const id = ref("");
  const required = ref(true);
  const saved = ref("");
  const removeConfirmed = ref(false);
  const resetConfirmed = ref(false);
  const mode = ref<FederationCaseMode>("transport");
  const datasetPublications = ref<Record<string, string>>({});
  const { error, errorSummary } = useErrorSummary();
  const fingerprint = computed(() =>
    JSON.stringify({ required: required.value, content: current.value }),
  );
  watch(current, (value) => emit("dirty", !!value), { deep: true });
  const changed = computed(() => !!current.value && fingerprint.value !== saved.value);

  function applyDataset(value: FederationDatasetSeeds | DatasetCompositionSeeds): void {
    const native =
      current.value && federationCaseIsNative(current.value) ? current.value : undefined;
    if (!native || props.disabled) {
      return;
    }
    const applied = federationDatasetSeedApplication(value);
    if (!applied) {
      return;
    }
    const target = native.input.sources.find((source) => source.sourceId === applied.sourceId);
    if (
      !target ||
      !federationDatasetDependencies(props.publications, props.training, applied.sourceId).some(
        (publication) => publication.id === applied.origin.publicationId,
      )
    ) {
      return;
    }
    target.fixtures = applied.fixtures;
    native.editorialOrigin = {
      format: "federation-dataset-case-origin-v1",
      sources: [
        ...(native.editorialOrigin?.sources ?? []).filter(
          (source) => source.sourceId !== applied.sourceId,
        ),
        applied.origin,
      ],
    };
  }

  function resetPlan(): void {
    if (!current.value || !resetConfirmed.value) {
      return;
    }
    const old = current.value;
    datasetPublications.value = {};
    mode.value = federationCaseIsNative(old) ? "transport" : "synthetic";
    current.value = { ...emptyFederationEditableCase(props.training, mode.value), name: old.name };
    resetConfirmed.value = false;
  }

  function expectedChange(event: Event): void {
    if (!current.value) {
      return;
    }
    const value = (event.target as HTMLSelectElement).value;
    current.value.expected = federationCaseExpectedResult(
      value === "success" ? "success" : (value as FederationCaseErrorCode),
      federationCaseIsNative(current.value),
      props.training,
    );
  }

  async function edit(test?: TrainingCase): Promise<void> {
    if (current.value && !(await props.confirmDiscard())) {
      return;
    }
    id.value = test?.id ?? "";
    datasetPublications.value = {};
    required.value = test?.required ?? true;
    removeConfirmed.value = false;
    resetConfirmed.value = false;
    error.value = "";
    current.value = test
      ? (JSON.parse(JSON.stringify(test.content)) as FederationEditableCase)
      : emptyFederationEditableCase(props.training, mode.value);
    saved.value = fingerprint.value;
  }

  async function close(): Promise<void> {
    if (
      (changed.value || resetConfirmed.value || removeConfirmed.value) &&
      !(await props.confirmDiscard())
    ) {
      return;
    }
    current.value = undefined;
    datasetPublications.value = {};
    removeConfirmed.value = false;
    error.value = "";
  }

  function submit(remove = false): void {
    if (!current.value || (remove && !removeConfirmed.value)) {
      return;
    }
    const result = federationEditableCaseSchema.safeParse(current.value);
    if (!result.success) {
      error.value = "Revise SQL, parâmetros, entradas sintéticas e resultado esperado do caso.";
      return;
    }
    emit("save", {
      ...(id.value ? { id: id.value } : {}),
      remove,
      required: required.value,
      content: result.data,
    });
  }

  return {
    current,
    id,
    required,
    removeConfirmed,
    resetConfirmed,
    mode,
    datasetPublications,
    changed,
    error,
    errorSummary,
    edit,
    close,
    submit,
    resetPlan,
    expectedChange,
    applyDataset,
  };
}
