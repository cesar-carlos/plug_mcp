<script setup lang="ts">
import type { DatasetCompositionSeeds } from "../../../src/domain/persona-v2/dataset-composition";
import type { DirectOperationDatasetSeeds } from "../../../src/domain/persona-v2/direct-operation-dataset";
import { useDirectOperationDataset } from "./use-direct-operation-dataset";

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
  choose: [DirectOperationDatasetSeeds];
  composition: [DatasetCompositionSeeds];
  lock: [boolean];
}>();
const {
  catalogs,
  items,
  catalogId,
  datasetId,
  version,
  cursor,
  preview,
  materials,
  error,
  errorSummary,
  busy,
  loadCatalogs,
  loadItems,
  addMaterial,
  prepare,
  apply,
} = useDirectOperationDataset(props, emit);
</script>
<template>
  <details>
    <summary>Importar sementes diretamente da biblioteca</summary>
    <p>
      Escolha um dataset para a fonte selecionada. A importação altera somente as sementes ao
      aplicar; parâmetros, SQL e resultado esperado precisam de revisão antes de salvar.
    </p>
    <button type="button" :disabled="disabled || busy" @click="loadCatalogs">
      Listar catálogos editoriais
    </button>
    <label v-if="catalogs.length"
      >Catálogo do dataset
      <select v-model="catalogId" :disabled="disabled || busy">
        <option value="">Selecione</option>
        <option v-for="catalog in catalogs" :key="catalog.id" :value="catalog.id">
          {{ catalog.name }}
        </option>
      </select>
    </label>
    <button v-if="catalogId" type="button" :disabled="disabled || busy" @click="loadItems()">
      Listar datasets da biblioteca
    </button>
    <button v-if="cursor" type="button" :disabled="disabled || busy" @click="loadItems(true)">
      Carregar mais itens da biblioteca
    </button>
    <label v-if="items.length"
      >Dataset da biblioteca
      <select v-model="datasetId" :disabled="disabled || busy">
        <option value="">Selecione</option>
        <option v-for="item in items" :key="item.id" :value="item.id">
          {{ item.name }} · versão {{ item.version }}
        </option>
      </select>
    </label>
    <template v-if="datasetId">
      <label
        >Versão do dataset<input
          v-model.number="version"
          type="number"
          min="1"
          step="1"
          :disabled="disabled || busy"
      /></label>
      <p>
        Você pode indicar uma versão anterior. A versão escolhida será conferida, sem atualização
        automática.
      </p>
      <button type="button" :disabled="disabled || busy" @click="prepare()">
        Preparar sementes da biblioteca
      </button>
      <button
        type="button"
        :disabled="disabled || busy || materials.length >= 4"
        @click="addMaterial"
      >
        Adicionar versão à combinação
      </button>
    </template>
    <div v-if="materials.length">
      <p>
        Combinação explícita: até quatro datasets. Linhas são concatenadas na ordem abaixo, sem
        deduplicar; tabelas repetidas exigem o mesmo template e colunas. Preparar não altera o caso.
      </p>
      <ol>
        <li
          v-for="(item, index) in materials"
          :key="`${item.catalogId}:${item.dataset.id}:${item.dataset.version}`"
        >
          {{ item.name }} · versão {{ item.dataset.version }}
          <button
            type="button"
            :disabled="disabled || busy"
            :aria-label="`Remover ${item.name} versão ${item.dataset.version} da combinação`"
            @click="materials.splice(index, 1)"
          >
            Remover da combinação
          </button>
        </li>
      </ol>
      <button type="button" :disabled="disabled || busy" @click="prepare(true)">
        Preparar combinação de datasets
      </button>
    </div>
    <p v-if="busy" role="status">Conferindo biblioteca e operação…</p>
    <div v-if="preview">
      <p>
        <template v-if="'dataset' in preview"
          >{{ preview.dataset.name }} · versão {{ preview.dataset.version }} ·</template
        >
        <template v-else>Combinação de {{ preview.origin.materials.length }} dataset(s) ·</template>
        {{ preview.fixtures.length }} tabelas. Nenhum caso salvo ou teste executado.
      </p>
      <pre>{{ JSON.stringify(preview.fixtures, null, 2) }}</pre>
      <button type="button" :disabled="disabled || busy" @click="apply">
        Substituir sementes pelo dataset da biblioteca
      </button>
    </div>
    <p v-if="error" ref="errorSummary" role="alert" tabindex="-1" class="error">{{ error }}</p>
  </details>
</template>
