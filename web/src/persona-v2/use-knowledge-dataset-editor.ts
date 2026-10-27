import { computed, onBeforeUnmount, ref, watch, type ComputedRef, type Ref } from "vue";
import type { StructureContent } from "../../../src/domain/persona-v2/shared-knowledge";
import type { LibraryPayload } from "../../../src/application/persona-v2/knowledge-library-schema";
import {
  buildDatasetPayload,
  canAddDatasetRow,
  datasetCellCount,
  datasetEditorDirty,
  datasetEditorErrorMessage,
  datasetRowCount,
  datasetTableFields,
  eligibleDatasetTables,
  emptyDatasetRow,
  remainingDatasetTables,
  type DatasetProvenanceKind,
  type DatasetTableEdit,
  type DatasetTemplateTable,
} from "./knowledge-dataset-editor";
import { useErrorSummary } from "./useErrorSummary";

export interface KnowledgeDatasetEditorProps {
  template: { id: string; version: number; hash: string; name: string; content: StructureContent };
  disabled: boolean;
}

export interface KnowledgeDatasetEditorEmit {
  (event: "dirty", value: boolean): void;
  (
    event: "create",
    value: { slug: string; name: string; payload: Extract<LibraryPayload, { kind: "dataset" }> },
  ): void;
}

export interface KnowledgeDatasetEditorState {
  slug: Ref<string>;
  name: Ref<string>;
  description: Ref<string>;
  authorizationRef: Ref<string>;
  provenance: Ref<DatasetProvenanceKind>;
  chosenTable: Ref<string>;
  tables: Ref<DatasetTableEdit[]>;
  error: Ref<string>;
  errorSummary: Ref<HTMLElement | undefined>;
  eligible: ComputedRef<DatasetTemplateTable[]>;
  remaining: ComputedRef<DatasetTemplateTable[]>;
  rowCount: ComputedRef<number>;
  cellCount: ComputedRef<number>;
  fields: (table: DatasetTableEdit) => readonly DatasetTemplateTable["columns"][number][];
  addTable: () => void;
  addRow: (table: DatasetTableEdit) => void;
  removeTable: (table: DatasetTableEdit) => void;
  removeRow: (table: DatasetTableEdit, index: number) => void;
  reset: () => void;
  submit: () => void;
}

export function useKnowledgeDatasetEditor(
  props: KnowledgeDatasetEditorProps,
  emit: KnowledgeDatasetEditorEmit,
): KnowledgeDatasetEditorState {
  const slug = ref("");
  const name = ref("");
  const description = ref("");
  const authorizationRef = ref("");
  const provenance = ref<DatasetProvenanceKind>("synthetic");
  const chosenTable = ref("");
  const tables = ref<DatasetTableEdit[]>([]);
  const { error, errorSummary } = useErrorSummary();
  const eligible = computed(() => eligibleDatasetTables(props.template.content.tables));
  const remaining = computed(() => remainingDatasetTables(eligible.value, tables.value));
  const dirty = computed(() =>
    datasetEditorDirty({
      slug: slug.value,
      name: name.value,
      description: description.value,
      authorizationRef: authorizationRef.value,
      provenance: provenance.value,
      chosenTable: chosenTable.value,
      tables: tables.value,
    }),
  );
  const rowCount = computed(() => datasetRowCount(tables.value));
  const cellCount = computed(() => datasetCellCount(tables.value));
  watch(dirty, (value) => emit("dirty", value), { immediate: true });
  onBeforeUnmount(() => emit("dirty", false));
  function fields(table: DatasetTableEdit): readonly DatasetTemplateTable["columns"][number][] {
    return datasetTableFields(eligible.value, table);
  }
  function addTable(): void {
    if (props.disabled || !remaining.value.some((table) => table.id === chosenTable.value)) {
      return;
    }
    tables.value.push({ id: chosenTable.value, columns: [], rows: [] });
    chosenTable.value = "";
  }
  function addRow(table: DatasetTableEdit): void {
    if (
      props.disabled ||
      !canAddDatasetRow(rowCount.value, cellCount.value, table.columns.length)
    ) {
      return;
    }
    table.rows.push(emptyDatasetRow(fields(table)));
  }
  function removeTable(table: DatasetTableEdit): void {
    tables.value.splice(tables.value.indexOf(table), 1);
  }
  function removeRow(table: DatasetTableEdit, index: number): void {
    table.rows.splice(index, 1);
  }
  function reset(): void {
    slug.value = "";
    name.value = "";
    description.value = "";
    authorizationRef.value = "";
    provenance.value = "synthetic";
    chosenTable.value = "";
    tables.value = [];
    error.value = "";
  }
  function submit(): void {
    if (props.disabled) {
      return;
    }
    error.value = "";
    try {
      emit("create", {
        slug: slug.value,
        name: name.value,
        payload: buildDatasetPayload({
          templateId: props.template.id,
          templateVersion: props.template.version,
          templateHash: props.template.hash,
          provenance: provenance.value,
          description: description.value,
          authorizationRef: authorizationRef.value,
          tables: tables.value,
          eligible: eligible.value,
        }),
      });
    } catch (cause) {
      error.value = datasetEditorErrorMessage(cause);
    }
  }
  return {
    slug,
    name,
    description,
    authorizationRef,
    provenance,
    chosenTable,
    tables,
    error,
    errorSummary,
    eligible,
    remaining,
    rowCount,
    cellCount,
    fields,
    addTable,
    addRow,
    removeTable,
    removeRow,
    reset,
    submit,
  };
}
