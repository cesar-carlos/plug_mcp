<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import type { OperationTestDetails } from "../../../src/domain/persona-v2/catalog";
import { useErrorSummary } from "./useErrorSummary";
import QueryCaseEditor from "./QueryCaseEditor.vue";
import type { Training } from "./model";
import type { QueryPublicationCase } from "../../../src/domain/persona-v2/publication-fixture";
import {
  datasetCaseOptionsSchema,
  type DatasetCaseOptions,
  type DatasetVersionReference,
} from "../../../src/domain/persona-v2/dataset-case-options";
import {
  datasetCaseSeedsSchema,
  type DatasetCaseSeeds,
} from "../../../src/domain/persona-v2/dataset-case-seeds";
const props = defineProps<{
  root: string;
  revision: number;
  disabled: boolean;
  training: Training;
  confirmDiscard: () => Promise<boolean>;
  api: <T>(url: string, body?: unknown) => Promise<T>;
}>();
const emit = defineEmits<{ dirty: [boolean]; lock: [boolean]; saved: [number] }>();
const editorKey = ref(0),
  caseDirty = ref(false);
const message = ref("");
watch(caseDirty, (value) => emit("dirty", value));
const details = ref<OperationTestDetails>();
const busy = ref(false);
const { error, errorSummary } = useErrorSummary();
let epoch = 0;
watch(
  () => [props.root, props.revision, props.disabled],
  (next, previous) => {
    if (busy.value) return;
    if (!props.disabled && next[0] === previous?.[0] && next[1] === previous?.[1]) return;
    epoch++;
    busy.value = false;
    details.value = undefined;
    error.value = "";
  },
);
watch(
  () => props.root,
  () => {
    epoch++;
  },
);
onBeforeUnmount(() => {
  epoch++;
});
async function load(more = false) {
  if (busy.value || props.disabled) return;
  const run = ++epoch,
    previous = details.value;
  busy.value = true;
  emit("lock", true);
  error.value = "";
  try {
    const cursor = more ? previous?.nextCursor : undefined;
    const result = await props.api<OperationTestDetails>(
      `${props.root}/testes-consulta${cursor ? `?after=${encodeURIComponent(cursor)}` : ""}`,
    );
    if (run !== epoch) return;
    if (
      result.revision !== props.revision ||
      (more &&
        previous &&
        (result.packageHash !== previous.packageHash || result.casesHash !== previous.casesHash))
    ) {
      details.value = undefined;
      throw new Error(
        "O treinamento ou os casos mudaram. Recarregue o rascunho antes de revisar os relatórios.",
      );
    }
    details.value =
      more && previous ? { ...result, reports: [...previous.reports, ...result.reports] } : result;
  } catch (e) {
    if (run === epoch) {
      details.value = undefined;
      error.value = e instanceof Error ? e.message : "Não foi possível ler os testes.";
    }
  } finally {
    if (run === epoch) busy.value = false;
    emit("lock", false);
  }
}
async function loadDatasetOptions(after?: {
  id: string;
  version: number;
}): Promise<DatasetCaseOptions> {
  if (busy.value || props.disabled)
    throw new Error("Aguarde a ação atual antes de listar datasets.");
  const run = ++epoch;
  busy.value = true;
  emit("lock", true);
  try {
    const parsed = datasetCaseOptionsSchema.safeParse(
      await props.api<unknown>(`${props.root}/datasets-caso`, {
        expectedRevision: props.revision,
        ...(after ? { after } : {}),
      }),
    );
    if (!parsed.success)
      throw new Error("Não foi possível confirmar a lista de datasets; a edição foi preservada.");
    const result = parsed.data;
    if (
      run !== epoch ||
      result.revision !== props.revision ||
      result.sourceId !== props.training.sourceId
    ) {
      throw new Error("O contexto ou a revisão mudou; lista descartada.");
    }
    return result;
  } finally {
    busy.value = false;
    emit("lock", false);
  }
}
async function loadDatasetSeeds(dataset?: DatasetVersionReference): Promise<DatasetCaseSeeds> {
  if (busy.value || props.disabled)
    throw new Error("Aguarde a ação atual antes de carregar sementes.");
  const run = ++epoch;
  busy.value = true;
  emit("lock", true);
  try {
    const result = datasetCaseSeedsSchema.parse(
      await props.api<unknown>(`${props.root}/sementes-dataset`, {
        expectedRevision: props.revision,
        ...(dataset ? { dataset } : {}),
      }),
    );
    if (
      run !== epoch ||
      result.revision !== props.revision ||
      result.sourceId !== props.training.sourceId
    ) {
      throw new Error("O contexto ou a revisão mudou; sementes descartadas.");
    }
    return result;
  } finally {
    busy.value = false;
    emit("lock", false);
  }
}
async function save(value: {
  id?: string;
  required: boolean;
  remove: boolean;
  content: QueryPublicationCase;
}) {
  if (busy.value || props.disabled) return;
  const run = ++epoch;
  busy.value = true;
  emit("lock", true);
  error.value = "";
  message.value = "";
  try {
    const result = await props.api<{ revision: number }>(`${props.root}/casos-consulta`, {
      ...value,
      expectedRevision: props.revision,
    });
    if (run !== epoch) return;
    caseDirty.value = false;
    editorKey.value++;
    details.value = undefined;
    emit("saved", result.revision);
    message.value =
      "Caso salvo. Relatórios anteriores precisam ser conferidos para a nova revisão.";
  } catch (e) {
    if (run === epoch)
      error.value =
        e instanceof Error
          ? e.message
          : "Não foi possível salvar. Preserve sua edição e confira o estado antes de tentar novamente.";
  } finally {
    busy.value = false;
    emit("lock", false);
  }
}
function caseName(content: unknown): string {
  return content &&
    typeof content === "object" &&
    "name" in content &&
    typeof content.name === "string"
    ? content.name
    : "Caso sem nome informado";
}
</script>
<template>
  <section aria-label="Casos e relatórios da consulta" :aria-busy="busy">
    <h3>Casos e relatórios da consulta</h3>
    <p>
      O runner de operador executa testes em bases isoladas. Esta leitura não consulta dados, aprova
      evidências ou publica treinamento.
    </p>
    <p v-if="error" ref="errorSummary" role="alert" tabindex="-1">{{ error }}</p>
    <p v-if="message" role="status">{{ message }}</p>
    <QueryCaseEditor
      :key="editorKey"
      :training="training"
      :cases="details?.cases ?? []"
      :disabled="disabled || busy"
      :confirm-discard="confirmDiscard"
      :load-dataset-seeds="loadDatasetSeeds"
      :load-dataset-options="loadDatasetOptions"
      @dirty="caseDirty = $event"
      @save="save"
    />
    <button type="button" :disabled="disabled || busy" @click="load()">
      Consultar testes da consulta
    </button>
    <template v-if="details">
      <p>
        Revisão {{ details.revision }} ·
        {{
          details.requiredApproved
            ? "Relatório técnico obrigatório atual aprovado; revisão semântica permanece separada."
            : "Sem aprovação técnica obrigatória atual comprovada."
        }}
      </p>
      <p v-if="!details.cases.length">Nenhum caso cadastrado nesta revisão.</p>
      <ul>
        <li v-for="test in details.cases" :key="test.id">
          {{ caseName(test.content) }} · {{ test.required ? "obrigatório" : "opcional" }}
        </li>
      </ul>
      <p v-if="!details.reports.length">
        Nenhum relatório registrado. Isso não comprova ausência de testes.
      </p>
      <ul>
        <li v-for="report in details.reports" :key="report.id">
          {{ report.runnerId }} · revisão {{ report.revision }} ·
          {{ new Date(report.createdAt).toLocaleString() }} ·
          {{ report.approved ? "aprovado tecnicamente" : "reprovado" }} ·
          {{ report.current ? "conteúdo atual" : "conteúdo diferente ou não comprovado" }}
          <details>
            <summary>Resultados por caso</summary>
            <ul>
              <li v-for="item in report.results" :key="item.id">
                {{
                  details.cases.find((c) => c.id === item.id)
                    ? caseName(details.cases.find((c) => c.id === item.id)!.content)
                    : item.id
                }}: {{ item.passed ? "passou" : "falhou" }}
              </li>
            </ul>
          </details>
        </li>
      </ul>
      <p v-if="details.nextCursor">Lista de relatórios parcial.</p>
      <button
        v-if="details.nextCursor"
        type="button"
        :disabled="disabled || busy"
        @click="load(true)"
      >
        Mais relatórios da consulta
      </button>
    </template>
  </section>
</template>
