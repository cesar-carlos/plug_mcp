<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import type { DatasetCaseSeeds } from "../../../src/domain/persona-v2/dataset-case-seeds";
import type {
  DatasetCaseOptions,
  DatasetVersionReference,
} from "../../../src/domain/persona-v2/dataset-case-options";
import {
  queryPublicationCaseSchema,
  type QueryPublicationCase,
} from "../../../src/domain/persona-v2/publication-fixture";
import type { TrainingCase } from "../../../src/domain/persona-v2/catalog";
import type { Training } from "./model";
import FederationTypedRowsEditor from "./FederationTypedRowsEditor.vue";
import { scalarTypes } from "./operation-editor";
import { useErrorSummary } from "./useErrorSummary";
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
const current = ref<QueryPublicationCase>(),
  id = ref(""),
  required = ref(true),
  saved = ref(""),
  confirmed = ref(false);
const { error, errorSummary } = useErrorSummary();
const datasetOrigin = ref<DatasetCaseSeeds>();
const datasetOptions = ref<DatasetCaseOptions>();
const selectedDataset = ref("");
const datasetKey = (value: { id: string; version: number }) => `${value.id}:${value.version}`;
const chosenDataset = computed(() => {
  const item = datasetOptions.value?.datasets.find(
    (value) => datasetKey(value) === selectedDataset.value,
  );
  return item ? { id: item.id, version: item.version, hash: item.hash } : undefined;
});
const loadingSeeds = ref(false);
let live = true;
onBeforeUnmount(() => {
  live = false;
});
const fingerprint = computed(() =>
  JSON.stringify({ current: current.value, required: required.value }),
);
const dirty = computed(
  () => !!current.value && (fingerprint.value !== saved.value || confirmed.value),
);
watch(dirty, (value) => emit("dirty", value));
async function edit(test?: TrainingCase) {
  if (dirty.value && !(await props.confirmDiscard())) return;
  error.value = "";
  datasetOrigin.value = undefined;
  datasetOptions.value = undefined;
  selectedDataset.value = "";
  if (test) {
    const parsed = queryPublicationCaseSchema.safeParse(test.content);
    if (!parsed.success) {
      error.value =
        "Este caso não usa o formato declarativo atual. Preserve o original e revise-o pela API; não há conversão automática.";
      return;
    }
    current.value = parsed.data;
  } else
    current.value = {
      name: "",
      input: { params: {}, fixtures: [] },
      expected: { columns: [], rows: [], ordered: true },
    };
  id.value = test?.id ?? "";
  required.value = test?.required ?? true;
  confirmed.value = false;
  saved.value = fingerprint.value;
}
async function close() {
  if (dirty.value && !(await props.confirmDiscard())) return;
  current.value = undefined;
  datasetOrigin.value = undefined;
  datasetOptions.value = undefined;
  selectedDataset.value = "";
  confirmed.value = false;
}
async function listDatasets(more = false) {
  if (!current.value || props.disabled || loadingSeeds.value) return;
  const target = current.value;
  const previous = datasetOptions.value;
  if (more && !previous?.nextCursor) return;
  loadingSeeds.value = true;
  error.value = "";
  try {
    const result = await props.loadDatasetOptions(
      more ? (previous?.nextCursor ?? undefined) : undefined,
    );
    if (!live || current.value !== target) return;
    if (
      more &&
      previous &&
      (result.revision !== previous.revision ||
        result.sourceId !== previous.sourceId ||
        result.catalogId !== previous.catalogId ||
        JSON.stringify(result.template) !== JSON.stringify(previous.template))
    ) {
      throw new Error(
        "O contexto dos datasets mudou; preserve a edição e consulte a primeira página.",
      );
    }
    datasetOptions.value = result;
    selectedDataset.value = "";
  } catch (cause) {
    if (live && current.value === target)
      error.value = cause instanceof Error ? cause.message : "Não foi possível listar datasets.";
  } finally {
    loadingSeeds.value = false;
  }
}
async function useDatasetSeeds(dataset?: DatasetVersionReference) {
  if (!current.value || props.disabled || loadingSeeds.value) return;
  const target = current.value;
  loadingSeeds.value = true;
  try {
    if (target.input.fixtures.length && !(await props.confirmDiscard())) return;
    if (!live || props.disabled || current.value !== target) return;
    error.value = "";
    const suggestion = await props.loadDatasetSeeds(dataset);
    if (!live || current.value !== target) return;
    if (
      dataset &&
      (suggestion.dataset.id !== dataset.id ||
        suggestion.dataset.version !== dataset.version ||
        suggestion.dataset.hash !== dataset.hash)
    ) {
      throw new Error("A confirmação não corresponde ao dataset escolhido; edição preservada.");
    }
    target.input.fixtures = suggestion.fixtures;
    target.editorialOrigin = suggestion.origin;
    datasetOrigin.value = suggestion;
  } catch (cause) {
    if (live && current.value === target)
      error.value =
        cause instanceof Error
          ? cause.message
          : "Não foi possível carregar o dataset; sua edição foi preservada.";
  } finally {
    loadingSeeds.value = false;
  }
}
function submit(remove = false) {
  if (!current.value || props.disabled || (remove && !confirmed.value)) return;
  const parsed = queryPublicationCaseSchema.safeParse(current.value);
  if (!parsed.success) {
    error.value =
      "Revise nome, sementes, colunas e valores tipados do resultado esperado. Cada registro deve corresponder às colunas declaradas.";
    return;
  }
  error.value = "";
  emit("save", {
    ...(id.value ? { id: id.value } : {}),
    required: required.value,
    remove,
    content: parsed.data,
  });
}
</script>
<template>
  <section aria-label="Editor de casos da consulta">
    <p v-if="error" ref="errorSummary" tabindex="-1" role="alert">{{ error }}</p>
    <fieldset :disabled="disabled || loadingSeeds">
      <button v-for="test in cases" :key="test.id" type="button" @click="edit(test)">
        Editar caso {{ (test.content as { name?: string }).name ?? test.id }}
      </button>
      <button type="button" @click="edit()">Adicionar caso de consulta</button>
      <form v-if="current" aria-label="Caso de consulta" @submit.prevent="submit()">
        <label
          >Nome do caso de consulta<input v-model="current.name" required maxlength="200"
        /></label>
        <label><input v-model="required" type="checkbox" />Caso obrigatório</label>
        <label
          >SQL alternativo do caso (opcional)<textarea
            :value="current.input.sql"
            @input="current.input.sql = ($event.target as HTMLTextAreaElement).value || undefined"
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
          <button type="button" @click="current.input.params[parameter.name] = null">
            Usar nulo
          </button>
          <button type="button" @click="delete current.input.params[parameter.name]">
            Omitir parâmetro
          </button>
          <span>{{
            parameter.name in current.input.params
              ? current.input.params[parameter.name] === null
                ? "Nulo explícito"
                : "Valor informado"
              : "Omitido"
          }}</span>
        </fieldset>
        <p>
          Somente dados sintéticos ou explicitamente autorizados. O console não executa estas
          sementes.
        </p>
        <button type="button" @click="useDatasetSeeds()">
          Carregar sementes do dataset de origem
        </button>
        <button type="button" @click="listDatasets()">Escolher outro dataset deste template</button>
        <fieldset v-if="datasetOptions" aria-label="Escolha de dataset do caso">
          <legend>Datasets da mesma versão do template</legend>
          <p>
            A lista não comprova compatibilidade com o treinamento atual. Escolher não substitui
            sementes, salva casos ou executa testes.
          </p>
          <label
            >Dataset para preparar sementes<select v-model="selectedDataset">
              <option value="">Escolha uma versão</option>
              <option
                v-for="item in datasetOptions.datasets"
                :key="datasetKey(item)"
                :value="datasetKey(item)"
              >
                {{ item.name }} · versão {{ item.version }}
              </option>
            </select></label
          >
          <p v-if="!datasetOptions.datasets.length">Nenhum dataset disponível nesta página.</p>
          <button type="button" :disabled="!chosenDataset" @click="useDatasetSeeds(chosenDataset)">
            Preparar sementes do dataset selecionado
          </button>
          <p v-if="datasetOptions.nextCursor">Lista parcial; há mais versões.</p>
          <button v-if="datasetOptions.nextCursor" type="button" @click="listDatasets(true)">
            Próxima página de datasets
          </button>
          <button type="button" @click="listDatasets()">Primeira página de datasets</button>
        </fieldset>
        <p v-if="datasetOrigin" role="status" class="technical-value">
          Sementes copiadas para edição de {{ datasetOrigin.dataset.name }} · versão
          {{ datasetOrigin.dataset.version }}. Revise valores, campos gerados, parâmetros e
          resultado esperado antes de salvar. Nenhum caso foi salvo e nenhum teste foi executado ou
          aprovado.
        </p>
        <details v-if="datasetOrigin" class="technical-value">
          <summary>Origem editorial das sementes carregadas</summary>
          <p>
            Template {{ datasetOrigin.template.id }} · versão {{ datasetOrigin.template.version }} ·
            hash {{ datasetOrigin.template.hash }}
          </p>
          <p>Dataset {{ datasetOrigin.dataset.id }} · hash {{ datasetOrigin.dataset.hash }}</p>
          <p>
            A origem exibida identifica a cópia carregada. Edições locais não modificam a
            biblioteca; esta referência não é um relatório técnico.
          </p>
        </details>
        <details v-if="current.editorialOrigin" class="technical-value">
          <summary>Origem editorial registrada no caso</summary>
          <p>
            Template {{ current.editorialOrigin.template.id }} · versão
            {{ current.editorialOrigin.template.version }} · hash
            {{ current.editorialOrigin.template.hash }}
          </p>
          <p>
            Dataset {{ current.editorialOrigin.dataset.id }} · versão
            {{ current.editorialOrigin.dataset.version }} · hash
            {{ current.editorialOrigin.dataset.hash }}
          </p>
          <p>
            Fonte {{ current.editorialOrigin.sourceId }} · versão
            {{ current.editorialOrigin.sourceVersion }} · {{ current.editorialOrigin.dialect }}
          </p>
          <p>
            {{
              current.editorialOrigin.modified
                ? "Na última gravação, as sementes diferiam do dataset de origem."
                : "Na última gravação ou carga, as sementes correspondiam ao dataset de origem."
            }}
            Alterações locais serão conferidas pelo servidor ao salvar. Esta referência não aprova
            semântica, execução ou relatório.
          </p>
        </details>
        <fieldset v-for="(fixture, index) in current.input.fixtures" :key="index">
          <legend>Semente {{ index + 1 }}</legend>
          <label
            >Tabela da semente<select v-model="fixture.table">
              <option v-for="table in training.tables" :key="table.name" :value="table.name">
                {{ table.name }}
              </option>
            </select></label
          >
          <p>Ao trocar a tabela, revise os campos; nenhum valor é convertido automaticamente.</p>
          <label
            v-for="column in training.columns.filter((c) => c.table === fixture.table)"
            :key="column.name"
            ><input v-model="fixture.generated" type="checkbox" :value="column.name" />Gerado pelo
            banco: {{ column.name }}</label
          >
          <FederationTypedRowsEditor
            v-model="fixture.rows"
            :columns="training.columns.filter((c) => c.table === fixture.table).map((c) => c.name)"
            :label="`Semente ${index + 1}`"
          />
          <button type="button" @click="current.input.fixtures.splice(index, 1)">
            Remover semente {{ index + 1 }}
          </button>
        </fieldset>
        <button
          type="button"
          :disabled="!training.tables.length || current.input.fixtures.length >= 16"
          @click="
            current.input.fixtures.push({
              table: training.tables[0]!.name,
              generated: [],
              rows: [],
            })
          "
        >
          Adicionar semente
        </button>
        <fieldset>
          <legend>Resultado esperado</legend>
          <div v-for="(column, index) in current.expected.columns" :key="index">
            <label>Coluna esperada<input v-model="column.name" required /></label>
            <label
              >Tipo esperado<select v-model="column.type">
                <option v-for="type in scalarTypes" :key="type" :value="type">{{ type }}</option>
              </select></label
            >
            <button type="button" @click="current.expected.columns.splice(index, 1)">
              Remover coluna esperada {{ index + 1 }}
            </button>
          </div>
          <button
            type="button"
            :disabled="current.expected.columns.length >= 100"
            @click="current.expected.columns.push({ name: '', type: 'string' })"
          >
            Adicionar coluna esperada
          </button>
          <label
            ><input v-model="current.expected.ordered" type="checkbox" />Comparar a ordem dos
            registros</label
          >
          <FederationTypedRowsEditor
            v-model="current.expected.rows"
            :columns="current.expected.columns.map((c) => c.name).filter(Boolean)"
            label="Resultado esperado"
          />
        </fieldset>
        <button type="submit">Salvar caso de consulta</button>
        <template v-if="id"
          ><label><input v-model="confirmed" type="checkbox" />Confirmo remover este caso</label
          ><button type="button" :disabled="!confirmed" @click="submit(true)">
            Remover caso de consulta
          </button></template
        >
        <button type="button" @click="close()">Fechar edição do caso</button>
      </form>
    </fieldset>
  </section>
</template>
