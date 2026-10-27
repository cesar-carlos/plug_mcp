<script setup lang="ts">
import type {
  DatasetCaseOptions,
  DatasetVersionReference,
} from "../../../src/domain/persona-v2/dataset-case-options";
import type { DatasetCaseSeeds } from "../../../src/domain/persona-v2/dataset-case-seeds";
import type { QueryPublicationCase } from "../../../src/domain/persona-v2/publication-fixture";
import { queryCaseChosenDataset, queryCaseDatasetKey } from "./query-case-editor";

defineProps<{
  editorialOrigin?: QueryPublicationCase["editorialOrigin"];
  datasetOrigin?: DatasetCaseSeeds;
  datasetOptions?: DatasetCaseOptions;
}>();
const selectedDataset = defineModel<string>("selectedDataset", { required: true });
const emit = defineEmits<{
  listDatasets: [more?: boolean];
  useDatasetSeeds: [dataset?: DatasetVersionReference];
}>();
</script>
<template>
  <p>
    Somente dados sintéticos ou explicitamente autorizados. O console não executa estas sementes.
  </p>
  <button type="button" @click="emit('useDatasetSeeds')">
    Carregar sementes do dataset de origem
  </button>
  <button type="button" @click="emit('listDatasets')">Escolher outro dataset deste template</button>
  <fieldset v-if="datasetOptions" aria-label="Escolha de dataset do caso">
    <legend>Datasets da mesma versão do template</legend>
    <p>
      A lista não comprova compatibilidade com o treinamento atual. Escolher não substitui sementes,
      salva casos ou executa testes.
    </p>
    <label
      >Dataset para preparar sementes<select v-model="selectedDataset">
        <option value="">Escolha uma versão</option>
        <option
          v-for="item in datasetOptions.datasets"
          :key="queryCaseDatasetKey(item)"
          :value="queryCaseDatasetKey(item)"
        >
          {{ item.name }} · versão {{ item.version }}
        </option>
      </select></label
    >
    <p v-if="!datasetOptions.datasets.length">Nenhum dataset disponível nesta página.</p>
    <button
      type="button"
      :disabled="!queryCaseChosenDataset(datasetOptions, selectedDataset)"
      @click="emit('useDatasetSeeds', queryCaseChosenDataset(datasetOptions, selectedDataset))"
    >
      Preparar sementes do dataset selecionado
    </button>
    <p v-if="datasetOptions.nextCursor">Lista parcial; há mais versões.</p>
    <button v-if="datasetOptions.nextCursor" type="button" @click="emit('listDatasets', true)">
      Próxima página de datasets
    </button>
    <button type="button" @click="emit('listDatasets')">Primeira página de datasets</button>
  </fieldset>
  <p v-if="datasetOrigin" role="status" class="technical-value">
    Sementes copiadas para edição de {{ datasetOrigin.dataset.name }} · versão
    {{ datasetOrigin.dataset.version }}. Revise valores, campos gerados, parâmetros e resultado
    esperado antes de salvar. Nenhum caso foi salvo e nenhum teste foi executado ou aprovado.
  </p>
  <details v-if="datasetOrigin" class="technical-value">
    <summary>Origem editorial das sementes carregadas</summary>
    <p>
      Template {{ datasetOrigin.template.id }} · versão {{ datasetOrigin.template.version }} · hash
      {{ datasetOrigin.template.hash }}
    </p>
    <p>Dataset {{ datasetOrigin.dataset.id }} · hash {{ datasetOrigin.dataset.hash }}</p>
    <p>
      A origem exibida identifica a cópia carregada. Edições locais não modificam a biblioteca; esta
      referência não é um relatório técnico.
    </p>
  </details>
  <details v-if="editorialOrigin" class="technical-value">
    <summary>Origem editorial registrada no caso</summary>
    <p>
      Template {{ editorialOrigin.template.id }} · versão {{ editorialOrigin.template.version }} ·
      hash {{ editorialOrigin.template.hash }}
    </p>
    <p>
      Dataset {{ editorialOrigin.dataset.id }} · versão {{ editorialOrigin.dataset.version }} · hash
      {{ editorialOrigin.dataset.hash }}
    </p>
    <p>
      Fonte {{ editorialOrigin.sourceId }} · versão {{ editorialOrigin.sourceVersion }} ·
      {{ editorialOrigin.dialect }}
    </p>
    <p>
      {{
        editorialOrigin.modified
          ? "Na última gravação, as sementes diferiam do dataset de origem."
          : "Na última gravação ou carga, as sementes correspondiam ao dataset de origem."
      }}
      Alterações locais serão conferidas pelo servidor ao salvar. Esta referência não aprova
      semântica, execução ou relatório.
    </p>
  </details>
</template>
