<script setup lang="ts">
import type { FederationDatasetSeeds } from "../../../src/domain/persona-v2/federation-dataset";
import type { OperationDatasetSeeds } from "../../../src/domain/persona-v2/operation-dataset";
import { useOperationDataset } from "./use-operation-dataset";

const props = defineProps<{
  api: <T>(url: string, body?: unknown) => Promise<T>;
  base: string;
  skillId: string;
  revision: number;
  sourceId: string;
  disabled: boolean;
  federationPublicationId?: string;
}>();
const emit = defineEmits<{
  choose: [OperationDatasetSeeds];
  federation: [FederationDatasetSeeds];
  lock: [boolean];
}>();
const {
  queries,
  selected,
  preview,
  options,
  datasetKey,
  error,
  errorSummary,
  busy,
  resetSelection,
  load,
  loadOptions,
  prepare,
  apply,
} = useOperationDataset(props, emit);
</script>
<template>
  <details>
    <summary>Usar dataset editorial nas sementes</summary>
    <p>
      Escolha uma consulta importada com dataset da mesma fonte. Somente as sementes serão
      substituídas; revise parâmetros e resultado esperado antes de salvar. Nenhum teste será
      executado.
    </p>
    <button type="button" :disabled="disabled || busy" @click="load">
      Listar consultas da mesma fonte
    </button>
    <label v-if="queries.length"
      >Consulta de origem do dataset
      <select v-model="selected" :disabled="disabled || busy" @change="resetSelection">
        <option value="">Selecione</option>
        <option v-for="query in queries" :key="query.id" :value="query.id">
          {{ query.name }} · revisão {{ query.revision }}
        </option>
      </select>
    </label>
    <template v-if="selected">
      <button type="button" :disabled="disabled || busy" @click="loadOptions()">
        Escolher outra versão de dataset
      </button>
      <label v-if="options"
        >Dataset para as sementes SQL
        <select v-model="datasetKey" :disabled="disabled || busy" @change="preview = undefined">
          <option value="">Dataset original da consulta</option>
          <option
            v-for="item in options.datasets"
            :key="`${item.id}:${item.version}`"
            :value="`${item.id}:${item.version}`"
          >
            {{ item.name }} · versão {{ item.version }}
          </option>
        </select>
      </label>
      <p v-if="options && !options.datasets.length">
        Nenhum dataset disponível para esta versão de template.
      </p>
      <button
        v-if="options?.nextCursor"
        type="button"
        :disabled="disabled || busy"
        @click="loadOptions(true)"
      >
        Carregar mais versões de dataset
      </button>
    </template>
    <button v-if="selected" type="button" :disabled="disabled || busy" @click="prepare">
      {{ datasetKey ? "Preparar sementes da versão escolhida" : "Preparar sementes da consulta" }}
    </button>
    <p v-if="busy" role="status">Conferindo material editorial…</p>
    <div v-if="preview">
      <p>
        {{ preview.dataset.name }} · versão {{ preview.dataset.version }} ·
        {{ preview.fixtures.length }} tabelas
      </p>
      <pre>{{ JSON.stringify(preview.fixtures, null, 2) }}</pre>
      <button type="button" :disabled="disabled || busy" @click="apply">
        Substituir sementes pelo dataset
      </button>
    </div>
    <p v-if="error" ref="errorSummary" role="alert" tabindex="-1" class="error">{{ error }}</p>
  </details>
</template>
