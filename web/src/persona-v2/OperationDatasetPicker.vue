<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useDatasetRequest } from "./useDatasetRequest";
import {
  datasetCaseOptionsSchema,
  type DatasetCaseOptions,
} from "../../../src/domain/persona-v2/dataset-case-options";
import type { SkillDraft } from "../../../src/domain/persona-v2/catalog";
import {
  operationDatasetSeedsSchema,
  type OperationDatasetSeeds,
} from "../../../src/domain/persona-v2/operation-dataset";
import { useErrorSummary } from "./useErrorSummary";
import {
  federationDatasetSeedsSchema,
  type FederationDatasetSeeds,
} from "../../../src/domain/persona-v2/federation-dataset";
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
const queries = ref<SkillDraft[]>([]),
  selected = ref("");
const preview = ref<OperationDatasetSeeds | FederationDatasetSeeds>();
const options = ref<DatasetCaseOptions>();
const datasetKey = ref("");
const context = computed(() =>
  JSON.stringify([
    props.base,
    props.skillId,
    props.revision,
    props.sourceId,
    props.federationPublicationId,
    selected.value,
    datasetKey.value,
  ]),
);
watch(
  () => [props.base, props.skillId, props.revision, props.sourceId, props.federationPublicationId],
  () => {
    queries.value = [];
    selected.value = "";
    resetSelection();
  },
  { flush: "sync" },
);
function resetSelection() {
  preview.value = undefined;
  options.value = undefined;
  datasetKey.value = "";
}
const { error, errorSummary } = useErrorSummary();
const { busy, run } = useDatasetRequest(
  () => context.value,
  () => props.disabled,
  error,
  () => {
    preview.value = undefined;
  },
  (value) => emit("lock", value),
);
async function load() {
  await run(async (isCurrent) => {
    preview.value = undefined;
    const result = await props.api<{ skills: SkillDraft[] }>(`${props.base}/skills`);
    if (!isCurrent()) return;
    queries.value = result.skills.filter(
      (skill) =>
        skill.kind === "consulta" &&
        (!props.federationPublicationId ||
          skill.activePublicationId === props.federationPublicationId) &&
        (skill.training as { sourceId?: string }).sourceId === props.sourceId,
    );
    selected.value = "";
    resetSelection();
    if (!queries.value.length)
      error.value =
        "Nenhuma consulta da mesma fonte. Importe primeiro um template com dataset na biblioteca.";
  });
}
async function loadOptions(more = false) {
  await run(async (isCurrent) => {
    const query = queries.value.find((item) => item.id === selected.value);
    if (!query || (more && !options.value?.nextCursor)) return;
    preview.value = undefined;
    const page = datasetCaseOptionsSchema.parse(
      await props.api(`${props.base}/skills/${query.id}/datasets-caso`, {
        expectedRevision: query.revision,
        ...(more ? { after: options.value!.nextCursor } : {}),
      }),
    );
    if (!isCurrent()) return;
    if (
      page.revision !== query.revision ||
      page.sourceId !== props.sourceId ||
      (more &&
        options.value &&
        (page.catalogId !== options.value.catalogId ||
          JSON.stringify(page.template) !== JSON.stringify(options.value.template)))
    ) {
      throw new Error("O contexto do dataset mudou; confira novamente a consulta de origem.");
    }
    const datasets = more ? [...options.value!.datasets] : [];
    for (const item of page.datasets) {
      const previous = datasets.find(
        (value) => value.id === item.id && value.version === item.version,
      );
      if (previous && previous.hash !== item.hash)
        throw new Error("A referência do dataset mudou; releia a lista.");
      if (!previous) datasets.push(item);
    }
    options.value = { ...page, datasets };
    if (!more) datasetKey.value = "";
  });
}
async function prepare() {
  await run(async (isCurrent) => {
    preview.value = undefined;
    const query = queries.value.find((item) => item.id === selected.value);
    if (!query) return;
    const dataset = options.value?.datasets.find(
      (item) => `${item.id}:${item.version}` === datasetKey.value,
    );
    if (datasetKey.value && !dataset)
      throw new Error("Selecione uma versão disponível do dataset.");
    const result = (
      props.federationPublicationId ? federationDatasetSeedsSchema : operationDatasetSeedsSchema
    ).parse(
      await props.api(
        `${props.base}/skills/${props.skillId}/${props.federationPublicationId ? "sementes-dataset-cruzamento" : "sementes-dataset-operacao"}`,
        {
          expectedRevision: props.revision,
          querySkillId: query.id,
          queryRevision: query.revision,
          ...(props.federationPublicationId
            ? { publicationId: props.federationPublicationId }
            : {}),
          ...(dataset
            ? { dataset: { id: dataset.id, version: dataset.version, hash: dataset.hash } }
            : {}),
        },
      ),
    );
    if (!isCurrent()) return;
    if (
      result.revision !== props.revision ||
      result.sourceId !== props.sourceId ||
      result.origin.querySkillId !== query.id ||
      result.origin.queryRevision !== query.revision ||
      (props.federationPublicationId &&
        (result.origin.format !== "federation-source-dataset-v1" ||
          result.origin.publicationId !== props.federationPublicationId)) ||
      (dataset &&
        (result.dataset.id !== dataset.id ||
          result.dataset.version !== dataset.version ||
          result.dataset.hash !== dataset.hash))
    ) {
      throw new Error("Não foi possível confirmar a origem das sementes; a edição foi preservada.");
    }
    preview.value = result;
  });
}
function apply() {
  if (busy.value || props.disabled || !preview.value) return;
  if (preview.value.origin.format === "federation-source-dataset-v1")
    emit("federation", federationDatasetSeedsSchema.parse(preview.value));
  else emit("choose", operationDatasetSeedsSchema.parse(preview.value));
  preview.value = undefined;
}
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
