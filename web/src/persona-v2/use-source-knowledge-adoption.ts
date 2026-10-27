import { computed, ref, watch, type ComputedRef, type Ref } from "vue";
import {
  adoptTraining,
  comparisonSchema,
  type Comparison,
  type Content,
  type Inspection,
  type KnowledgeSelection,
} from "./knowledge-model";
import type { Training } from "./model";
import type { OperationTraining } from "./operation-editor";
import { adoptOperationKnowledge } from "./operation-knowledge";
import {
  sourceKnowledgeAppliedMessage,
  sourceKnowledgeCanApply,
  sourceKnowledgeCompareSelectionError,
  sourceKnowledgeComparisonBody,
  sourceKnowledgeComparisonKey,
  sourceKnowledgeErrorMessage,
  sourceKnowledgeMarksPendingOnTouch,
  sourceKnowledgeReferenceRemovedMessage,
  sourceKnowledgeSelectedTables,
  sourceKnowledgeWithoutReference,
} from "./source-knowledge";

export interface SourceKnowledgeAdoptionInput {
  props: {
    api: <T>(url: string, body?: unknown) => Promise<T>;
    disabled: boolean;
    training?: Training;
    operationTraining?: OperationTraining;
    registration?: boolean;
  };
  emit: {
    (event: "lock", value: boolean): void;
    (event: "training", value: Training): void;
    (event: "operationTraining", value: OperationTraining): void;
  };
  sourceBase: ComputedRef<string>;
  selection: Ref<KnowledgeSelection | undefined>;
  inspection: Ref<Inspection | undefined>;
  selectionKey: ComputedRef<string>;
  draftTraining: ComputedRef<Training | OperationTraining | undefined>;
  content: ComputedRef<Content | undefined>;
  error: Ref<string>;
  message: Ref<string>;
  run: (action: (isCurrent: () => boolean) => Promise<void>, fallback: string) => Promise<void>;
  bumpEpoch: () => void;
}

export interface SourceKnowledgeAdoptionState {
  comparison: Ref<Comparison | undefined>;
  pendingAdoption: Ref<boolean>;
  tables: Ref<string[]>;
  fields: Ref<string[]>;
  confirmed: Ref<boolean>;
  compare: () => Promise<void>;
  apply: () => void;
  removeReference: () => void;
  markTouched: () => void;
  reset: () => void;
}

export function useSourceKnowledgeAdoption(
  input: SourceKnowledgeAdoptionInput,
): SourceKnowledgeAdoptionState {
  const comparison = ref<Comparison>();
  const pendingAdoption = ref(false);
  const tables = ref<string[]>([]);
  const fields = ref<string[]>([]);
  const confirmed = ref(false);
  const selectedTables = computed(() =>
    sourceKnowledgeSelectedTables(input.content.value, tables.value, fields.value),
  );
  const comparisonKey = computed(() =>
    sourceKnowledgeComparisonKey({
      selectionKey: input.selectionKey.value,
      inspectionId: input.inspection.value?.id,
      selectedTables: input.draftTraining.value ? selectedTables.value : undefined,
      operationTraining: input.props.operationTraining,
    }),
  );
  watch(comparisonKey, () => {
    input.bumpEpoch();
    comparison.value = undefined;
    confirmed.value = false;
  });
  watch(input.selectionKey, () => {
    tables.value = [];
    fields.value = [];
  });

  function reset(): void {
    comparison.value = undefined;
    pendingAdoption.value = false;
    tables.value = [];
    fields.value = [];
  }

  async function compare(): Promise<void> {
    const currentSelection = input.selection.value;
    const currentInspection = input.inspection.value;
    if (!currentSelection || !currentInspection) {
      return;
    }
    await input.run(async (isCurrent) => {
      comparison.value = undefined;
      const selectionError = sourceKnowledgeCompareSelectionError(
        !!input.draftTraining.value,
        selectedTables.value,
      );
      if (selectionError) {
        throw new Error(selectionError);
      }
      const data = comparisonSchema.parse(
        await input.props.api<unknown>(`${input.sourceBase.value}/compatibilidade`, {
          ...sourceKnowledgeComparisonBody({
            selection: currentSelection,
            evidenceId: currentInspection.id,
            selectedTables: input.draftTraining.value ? selectedTables.value : undefined,
          }),
        }),
      );
      if (isCurrent()) {
        comparison.value = data;
      }
    }, "Não foi possível comparar.");
  }

  function apply(): void {
    input.error.value = "";
    const currentSelection = input.selection.value;
    const currentInspection = input.inspection.value;
    if (
      !sourceKnowledgeCanApply({
        hasDraft: !!input.draftTraining.value,
        hasSelection: !!currentSelection,
        hasInspection: !!currentInspection,
        comparisonStatus: comparison.value?.status,
        confirmed: confirmed.value,
      }) ||
      !currentSelection ||
      !currentInspection
    ) {
      return;
    }
    try {
      if (input.props.operationTraining) {
        input.emit(
          "operationTraining",
          adoptOperationKnowledge(
            input.props.operationTraining,
            currentSelection,
            currentInspection,
            tables.value,
            fields.value,
          ),
        );
      } else if (input.props.training) {
        input.emit(
          "training",
          adoptTraining(
            input.props.training,
            currentSelection,
            currentInspection,
            tables.value,
            fields.value,
          ),
        );
      }
      pendingAdoption.value = false;
      confirmed.value = false;
      input.message.value = sourceKnowledgeAppliedMessage;
    } catch (cause) {
      input.error.value = sourceKnowledgeErrorMessage(cause, "Revise a seleção.");
    }
  }

  function removeReference(): void {
    if (!input.draftTraining.value) {
      return;
    }
    const privateTraining = sourceKnowledgeWithoutReference(input.draftTraining.value);
    if (input.props.operationTraining) {
      input.emit("operationTraining", privateTraining as OperationTraining);
    } else {
      input.emit("training", privateTraining as Training);
    }
    pendingAdoption.value = false;
    input.message.value = sourceKnowledgeReferenceRemovedMessage;
  }

  function markTouched(): void {
    pendingAdoption.value = sourceKnowledgeMarksPendingOnTouch(
      !!input.draftTraining.value,
      input.props.registration,
    );
  }

  return {
    comparison,
    pendingAdoption,
    tables,
    fields,
    confirmed,
    compare,
    apply,
    removeReference,
    markTouched,
    reset,
  };
}
