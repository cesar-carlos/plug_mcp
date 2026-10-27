<script setup lang="ts">
import type { DatasetCompositionSeeds } from "../../../src/domain/persona-v2/dataset-composition";
import type { FederationDatasetSeeds } from "../../../src/domain/persona-v2/federation-dataset";
import type {
  FederationPublicationCase,
  FederationTraining,
} from "../../../src/domain/persona-v2/federation-training";
import type { QueryDependency } from "./federation-editor";
import {
  federationDatasetDependencies,
  federationSeedTableChoices,
  federationSourceColumns,
} from "./federation-case-editor";
import DirectOperationDatasetPicker from "./DirectOperationDatasetPicker.vue";
import FederationTypedRowsEditor from "./FederationTypedRowsEditor.vue";
import OperationDatasetPicker from "./OperationDatasetPicker.vue";
import OperationNameList from "./OperationNameList.vue";

const source = defineModel<FederationPublicationCase["input"]["sources"][number]>({
  required: true,
});
const datasetPublications = defineModel<Record<string, string>>("datasetPublications", {
  required: true,
});
defineProps<{
  publications: QueryDependency[];
  training: FederationTraining;
  disabled: boolean;
  caseId: string;
  editorialOrigin?: FederationPublicationCase["editorialOrigin"];
  api?: <T>(url: string, body?: unknown) => Promise<T>;
  base?: string;
  skillId?: string;
  revision?: number;
}>();
const emit = defineEmits<{
  applyDataset: [FederationDatasetSeeds | DatasetCompositionSeeds];
  lock: [boolean];
}>();
</script>
<template>
  <fieldset>
    <legend>
      Sementes da base
      {{
        publications.find((p) => p.sourceId === source.sourceId)?.sourceName ??
        "dependência indisponível"
      }}
    </legend>
    <p>
      Estas sementes são destinadas apenas à fixture declarada pelo operador. O console não escreve
      na base cadastrada.
    </p>
    <template v-if="api && base && skillId && revision">
      <label
        >Consulta publicada de origem do dataset
        <select v-model="datasetPublications[source.sourceId]">
          <option value="">Selecione</option>
          <option
            v-for="dependency in federationDatasetDependencies(
              publications,
              training,
              source.sourceId,
            )"
            :key="dependency.id"
            :value="dependency.id"
          >
            {{ dependency.name }} · revisão {{ dependency.revision }}
          </option>
        </select>
      </label>
      <DirectOperationDatasetPicker
        v-if="datasetPublications[source.sourceId]"
        :key="`direct:${caseId}:${source.sourceId}:${datasetPublications[source.sourceId]}`"
        :api="api"
        :base="base"
        :skill-id="skillId"
        :revision="revision"
        :source-id="source.sourceId"
        :federation-publication-id="datasetPublications[source.sourceId]"
        :disabled="disabled"
        @composition="emit('applyDataset', $event)"
        @lock="emit('lock', $event)"
      />
      <OperationDatasetPicker
        v-if="datasetPublications[source.sourceId]"
        :key="`${caseId}:${source.sourceId}:${datasetPublications[source.sourceId]}`"
        :api="api"
        :base="base"
        :skill-id="skillId"
        :revision="revision"
        :source-id="source.sourceId"
        :federation-publication-id="datasetPublications[source.sourceId]"
        :disabled="disabled"
        @federation="emit('applyDataset', $event)"
        @lock="emit('lock', $event)"
      />
      <p
        v-if="editorialOrigin?.sources.some((item) => item.sourceId === source.sourceId)"
        class="field-help"
      >
        Origem editorial registrada somente para esta base; salvar reconfere a publicação e o
        dataset.
      </p>
    </template>
    <fieldset v-for="(table, i) in source.fixtures" :key="i">
      <legend>Tabela sintética {{ i + 1 }}</legend>
      <label
        >Tabela da semente<select v-model="table.table" required>
          <option value="">Selecione</option>
          <option
            v-for="name in federationSeedTableChoices(
              publications,
              training,
              source.sourceId,
              table.table,
            )"
            :key="name"
            :value="name"
          >
            {{ name }}
          </option>
        </select></label
      >
      <OperationNameList
        :model-value="table.generated ?? []"
        label="Colunas geradas da semente"
        @update:model-value="table.generated = $event"
      />
      <FederationTypedRowsEditor
        v-model="table.rows"
        :columns="federationSourceColumns(publications, training, source.sourceId, table.table)"
        :label="`Sementes de ${table.table}`"
      />
      <button type="button" @click="source.fixtures.splice(i, 1)">
        Remover tabela da semente {{ i + 1 }}
      </button>
    </fieldset>
    <button
      type="button"
      :disabled="source.fixtures.length >= 16"
      @click="source.fixtures.push({ table: '', generated: [], rows: [] })"
    >
      Adicionar tabela de semente
    </button>
  </fieldset>
</template>
