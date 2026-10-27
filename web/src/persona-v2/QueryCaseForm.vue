<script setup lang="ts">
import type {
  DatasetCaseOptions,
  DatasetVersionReference,
} from "../../../src/domain/persona-v2/dataset-case-options";
import type { DatasetCaseSeeds } from "../../../src/domain/persona-v2/dataset-case-seeds";
import type { QueryPublicationCase } from "../../../src/domain/persona-v2/publication-fixture";
import type { Training } from "./model";
import QueryCaseDatasetFields from "./QueryCaseDatasetFields.vue";
import QueryCaseExpectedFields from "./QueryCaseExpectedFields.vue";
import QueryCaseFixtureFields from "./QueryCaseFixtureFields.vue";
import { queryCaseOptionalSql, queryCaseParameterStatus } from "./query-case-editor";

const current = defineModel<QueryPublicationCase>("current", { required: true });
const required = defineModel<boolean>("required", { required: true });
const confirmed = defineModel<boolean>("confirmed", { required: true });
const selectedDataset = defineModel<string>("selectedDataset", { required: true });
defineProps<{
  training: Training;
  caseId: string;
  datasetOrigin?: DatasetCaseSeeds;
  datasetOptions?: DatasetCaseOptions;
}>();
const emit = defineEmits<{
  submit: [];
  close: [];
  remove: [];
  listDatasets: [more?: boolean];
  useDatasetSeeds: [dataset?: DatasetVersionReference];
}>();
</script>
<template>
  <form aria-label="Caso de consulta" @submit.prevent="emit('submit')">
    <label>Nome do caso de consulta<input v-model="current.name" required maxlength="200" /></label>
    <label><input v-model="required" type="checkbox" />Caso obrigatório</label>
    <label
      >SQL alternativo do caso (opcional)<textarea
        :value="current.input.sql"
        @input="
          current.input.sql = queryCaseOptionalSql(($event.target as HTMLTextAreaElement).value)
        "
      />
    </label>
    <fieldset v-for="parameter in training.parameters" :key="parameter.name">
      <legend>Parâmetro {{ parameter.name }} · {{ parameter.type }}</legend>
      <label v-if="parameter.type === 'boolean'"
        >Valor<select v-model="current.input.params[parameter.name]">
          <option :value="true">Sim</option>
          <option :value="false">Não</option>
        </select></label
      >
      <label v-else>Valor<input v-model="current.input.params[parameter.name]" /></label>
      <button type="button" @click="current.input.params[parameter.name] = null">Usar nulo</button>
      <button type="button" @click="delete current.input.params[parameter.name]">
        Omitir parâmetro
      </button>
      <span>{{ queryCaseParameterStatus(current.input.params, parameter.name) }}</span>
    </fieldset>
    <QueryCaseDatasetFields
      v-model:selected-dataset="selectedDataset"
      :editorial-origin="current.editorialOrigin"
      :dataset-origin="datasetOrigin"
      :dataset-options="datasetOptions"
      @list-datasets="emit('listDatasets', $event)"
      @use-dataset-seeds="emit('useDatasetSeeds', $event)"
    />
    <QueryCaseFixtureFields v-model="current.input.fixtures" :training="training" />
    <QueryCaseExpectedFields v-model="current.expected" />
    <button type="submit">Salvar caso de consulta</button>
    <template v-if="caseId"
      ><label><input v-model="confirmed" type="checkbox" />Confirmo remover este caso</label
      ><button type="button" :disabled="!confirmed" @click="emit('remove')">
        Remover caso de consulta
      </button></template
    >
    <button type="button" @click="emit('close')">Fechar edição do caso</button>
  </form>
</template>
