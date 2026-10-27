<script setup lang="ts">
import type {
  DatasetCaseOptions,
  DatasetVersionReference,
} from "../../../src/domain/persona-v2/dataset-case-options";
import type { DatasetCaseSeeds } from "../../../src/domain/persona-v2/dataset-case-seeds";
import type { TrainingCase } from "../../../src/domain/persona-v2/catalog";
import type { QueryPublicationCase } from "../../../src/domain/persona-v2/publication-fixture";
import type { Training } from "./model";
import QueryCaseForm from "./QueryCaseForm.vue";
import { useQueryCaseEditor } from "./use-query-case-editor";

const props = defineProps<{
  training: Training;
  cases: readonly TrainingCase[];
  disabled: boolean;
  confirmDiscard: () => Promise<boolean>;
  loadDatasetSeeds: (dataset?: DatasetVersionReference) => Promise<DatasetCaseSeeds>;
  loadDatasetOptions: (after?: { id: string; version: number }) => Promise<DatasetCaseOptions>;
}>();
const emit = defineEmits<{
  dirty: [boolean];
  save: [{ id?: string; required: boolean; remove: boolean; content: QueryPublicationCase }];
}>();
const {
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
  edit,
  close,
  listDatasets,
  useDatasetSeeds,
  submit,
} = useQueryCaseEditor(props, emit);
</script>
<template>
  <section aria-label="Editor de casos da consulta">
    <p v-if="error" ref="errorSummary" tabindex="-1" role="alert">{{ error }}</p>
    <fieldset :disabled="disabled || loadingSeeds">
      <button v-for="test in cases" :key="test.id" type="button" @click="edit(test)">
        Editar caso {{ (test.content as { name?: string }).name ?? test.id }}
      </button>
      <button type="button" @click="edit()">Adicionar caso de consulta</button>
      <QueryCaseForm
        v-if="current"
        v-model:current="current"
        v-model:required="required"
        v-model:confirmed="confirmed"
        v-model:selected-dataset="selectedDataset"
        :training="training"
        :case-id="id"
        :dataset-origin="datasetOrigin"
        :dataset-options="datasetOptions"
        @submit="submit()"
        @close="close"
        @remove="submit(true)"
        @list-datasets="listDatasets($event)"
        @use-dataset-seeds="useDatasetSeeds($event)"
      />
    </fieldset>
  </section>
</template>
