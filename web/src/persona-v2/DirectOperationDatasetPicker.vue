<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { z } from "zod";
import {
  directOperationDatasetSeedsSchema,
  type DirectOperationDatasetSeeds,
} from "../../../src/domain/persona-v2/direct-operation-dataset";
import { useDatasetRequest } from "./useDatasetRequest";
import { useErrorSummary } from "./useErrorSummary";
import {
  datasetCompositionSeedsSchema,
  type DatasetCompositionSeeds,
  type DatasetCompositionSelection,
} from "../../../src/domain/persona-v2/dataset-composition";

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
const catalogSchema = z.object({ id: z.uuid(), name: z.string(), role: z.string() });
const itemSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  kind: z.string(),
  version: z.number().int().positive(),
  hash: z.string().regex(/^[a-f0-9]{64}$/),
});
const catalogs = ref<z.infer<typeof catalogSchema>[]>([]);
const items = ref<z.infer<typeof itemSchema>[]>([]);
const catalogId = ref("");
const datasetId = ref("");
const version = ref(1);
const cursor = ref<string | null>(null);
const preview = ref<DirectOperationDatasetSeeds | DatasetCompositionSeeds>();
const materials = ref<(DatasetCompositionSelection["materials"][number] & { name: string })[]>([]);
const { error, errorSummary } = useErrorSummary();
const context = computed(() =>
  JSON.stringify([
    props.base,
    props.skillId,
    props.revision,
    props.sourceId,
    props.federationPublicationId,
    materials.value,
    catalogId.value,
    datasetId.value,
    version.value,
  ]),
);
const { busy, run } = useDatasetRequest(
  () => context.value,
  () => props.disabled,
  error,
  () => {
    preview.value = undefined;
  },
  (value) => emit("lock", value),
);
watch(
  () => [props.base, props.skillId, props.revision, props.sourceId, props.federationPublicationId],
  () => {
    catalogs.value = [];
    materials.value = [];
    catalogId.value = "";
    resetItems();
  },
  { flush: "sync" },
);
watch(catalogId, resetItems, { flush: "sync" });
watch(
  datasetId,
  () => {
    version.value = items.value.find((item) => item.id === datasetId.value)?.version ?? 1;
  },
  { flush: "sync" },
);
function resetItems() {
  items.value = [];
  datasetId.value = "";
  cursor.value = null;
  preview.value = undefined;
}
async function loadCatalogs() {
  await run(async (isCurrent) => {
    preview.value = undefined;
    const result = z
      .object({ catalogs: z.array(catalogSchema) })
      .parse(await props.api("/api/admin/catalogos"));
    if (!isCurrent()) return;
    catalogs.value = result.catalogs.filter((c) =>
      ["administrator", "curator", "contributor"].includes(c.role),
    );
    catalogId.value = "";
    resetItems();
    if (!catalogs.value.length) error.value = "Nenhum catálogo com acesso editorial disponível.";
  });
}
async function loadItems(more = false) {
  await run(async (isCurrent) => {
    if (!catalogId.value || (more && !cursor.value)) return;
    preview.value = undefined;
    const result = z
      .object({ items: z.array(itemSchema), nextCursor: z.uuid().nullable() })
      .parse(
        await props.api(
          `/api/admin/catalogos/${catalogId.value}/biblioteca${more ? `?beforeId=${cursor.value}` : ""}`,
        ),
      );
    if (!isCurrent()) return;
    const datasets = result.items.filter((item) => item.kind === "dataset");
    items.value = more
      ? [
          ...items.value,
          ...datasets.filter((item) => !items.value.some((old) => old.id === item.id)),
        ]
      : datasets;
    cursor.value = result.nextCursor;
    if (!more) datasetId.value = "";
    if (!items.value.length)
      error.value = cursor.value
        ? "Nenhum dataset nesta página; carregue mais itens."
        : "Nenhum dataset disponível neste catálogo.";
  });
}
async function selectedMaterial(isCurrent: () => boolean) {
  if (
    !items.value.some((item) => item.id === datasetId.value) ||
    !Number.isSafeInteger(version.value) ||
    version.value < 1
  )
    throw new Error("Escolha um dataset e uma versão inteira positiva.");
  const item = itemSchema.parse(
    await props.api(
      `/api/admin/catalogos/${catalogId.value}/biblioteca/${datasetId.value}?version=${version.value}`,
    ),
  );
  if (!isCurrent()) return;
  if (item.id !== datasetId.value || item.version !== version.value || item.kind !== "dataset")
    throw new Error("A versão recebida não corresponde à seleção.");
  return {
    catalogId: catalogId.value,
    dataset: { id: item.id, version: item.version, hash: item.hash },
    name: item.name,
  };
}
async function addMaterial() {
  await run(async (isCurrent) => {
    if (materials.value.length >= 4)
      throw new Error("Escolha no máximo quatro datasets por fonte.");
    const selected = await selectedMaterial(isCurrent);
    if (!selected || !isCurrent()) return;
    if (
      materials.value.some(
        (item) =>
          item.catalogId === selected.catalogId &&
          item.dataset.id === selected.dataset.id &&
          item.dataset.version === selected.dataset.version,
      )
    )
      throw new Error("Essa versão já está na combinação.");
    materials.value = [...materials.value, selected];
  });
}
async function prepareComposition(
  isCurrent: () => boolean,
  chosen: DatasetCompositionSelection["materials"],
) {
  const result = datasetCompositionSeedsSchema.parse(
    await props.api(`${props.base}/skills/${props.skillId}/compor-sementes-datasets`, {
      expectedRevision: props.revision,
      materials: chosen,
      ...(props.federationPublicationId ? { publicationId: props.federationPublicationId } : {}),
    }),
  );
  if (!isCurrent()) return;
  const refs = result.origin.materials.map(({ catalogId, dataset }) => ({ catalogId, dataset }));
  if (
    result.revision !== props.revision ||
    result.sourceId !== props.sourceId ||
    JSON.stringify(refs) !== JSON.stringify(chosen) ||
    (props.federationPublicationId
      ? result.origin.format !== "federation-source-dataset-composition-v1" ||
        result.origin.publicationId !== props.federationPublicationId
      : result.origin.format !== "operation-dataset-composition-v1")
  )
    throw new Error("Composição recebida não corresponde à seleção.");
  preview.value = result;
}
async function prepare(combine = false) {
  await run(async (isCurrent) => {
    preview.value = undefined;
    if (combine) {
      if (!materials.value.length) return;
      await prepareComposition(
        isCurrent,
        materials.value.map(({ catalogId, dataset }) => ({ catalogId, dataset })),
      );
      return;
    }
    const selected = await selectedMaterial(isCurrent);
    if (!selected || !isCurrent()) return;
    if (props.federationPublicationId) {
      await prepareComposition(isCurrent, [
        { catalogId: selected.catalogId, dataset: selected.dataset },
      ]);
      return;
    }
    const item = selected.dataset;
    const result = directOperationDatasetSeedsSchema.parse(
      await props.api(`${props.base}/skills/${props.skillId}/sementes-dataset-operacao-direto`, {
        expectedRevision: props.revision,
        catalogId: catalogId.value,
        dataset: { id: item.id, version: item.version, hash: item.hash },
      }),
    );
    if (!isCurrent()) return;
    if (
      result.revision !== props.revision ||
      result.sourceId !== props.sourceId ||
      result.catalogId !== catalogId.value ||
      result.dataset.id !== item.id ||
      result.dataset.version !== item.version ||
      result.dataset.hash !== item.hash
    )
      throw new Error("A origem das sementes mudou; confira novamente o material.");
    preview.value = result;
  });
}
function apply() {
  if (props.disabled || busy.value || !preview.value) return;
  if ("materials" in preview.value.origin)
    emit("composition", datasetCompositionSeedsSchema.parse(preview.value));
  else emit("choose", directOperationDatasetSeedsSchema.parse(preview.value));
  preview.value = undefined;
}
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
