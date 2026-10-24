<script setup lang="ts">
import { computed, onBeforeUnmount, shallowReactive, ref, watch } from "vue";
import { ExternalPreparationSession } from "./external-preparation";
import {
  editExternalValues,
  readExternalValues,
  type ExternalTestValue,
} from "./external-test-values";
import ExternalTestFields from "./ExternalTestFields.vue";
import ConsumerOperationPanel from "./ConsumerOperationPanel.vue";
import { useErrorSummary } from "./useErrorSummary";
const props = defineProps<{
  personaId: string;
  bearer: string;
  disabled: boolean;
  call: <T>(tool: string, args: unknown) => Promise<T>;
  confirmDiscard: () => Promise<boolean>;
}>();
const emit = defineEmits<{ bearer: [string]; dirty: [boolean]; lock: [boolean] }>();
const session = shallowReactive(
  new ExternalPreparationSession(props.call, () => ({
    personaId: props.personaId,
    bearer: props.bearer,
  })),
);
const skillId = ref(""),
  confirmed = ref(false),
  values = ref<Record<string, ExternalTestValue>>({});
const selected = computed(() => session.choices.find((row) => row.skillId === skillId.value));
const { error, errorSummary } = useErrorSummary();
let live = true;
watch(
  () => session.error,
  (v) => {
    error.value = v;
  },
);
watch(
  () => session.busy,
  (v) => emit("lock", v),
  { flush: "sync" },
);
watch([values, confirmed, skillId], () => emit("dirty", !!skillId.value && !session.result), {
  deep: true,
});
function clear() {
  session.invalidate();
  skillId.value = "";
  values.value = {};
  confirmed.value = false;
  error.value = "";
  emit("dirty", false);
}
watch(() => [props.personaId, props.bearer], clear, { flush: "sync" });
watch(skillId, () => {
  values.value = selected.value ? editExternalValues(selected.value.contract.input) : {};
  confirmed.value = false;
});
watch(
  values,
  () => {
    confirmed.value = false;
  },
  { deep: true },
);
onBeforeUnmount(() => {
  live = false;
  clear();
  emit("lock", false);
});
async function load() {
  if (props.disabled || session.busy) return;
  if (skillId.value && !(await props.confirmDiscard())) return;
  if (!live || props.disabled) return;
  clear();
  await session.run();
}
async function prepare() {
  if (props.disabled || session.busy || !confirmed.value || !selected.value) return;
  try {
    const input = readExternalValues(selected.value.contract.input, values.value);
    confirmed.value = false;
    await session.run(selected.value, input);
    if (session.result) {
      values.value = {};
      emit("dirty", false);
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Confira os campos.";
  }
}
</script>
<template>
  <section aria-label="Preparar ação externa" :aria-busy="session.busy">
    <h3>Preparar ação externa</h3>
    <p>
      A preparação registra os dados para revisão. Não envia a ação ao serviço nem concede
      aprovação.
    </p>
    <label
      >Token do consumidor para preparar<input
        type="password"
        :value="bearer"
        autocomplete="off"
        :disabled="disabled || session.busy"
        @input="emit('bearer', ($event.target as HTMLInputElement).value)"
    /></label>
    <button class="secondary" :disabled="disabled || session.busy || !bearer" @click="load">
      Carregar ações concedidas / iniciar nova preparação
    </button>
    <p v-if="error" ref="errorSummary" tabindex="-1" role="alert">{{ error }}</p>
    <p v-if="session.loaded && !session.choices.length" role="status">
      Nenhuma ação publicada está disponível para este token.
    </p>
    <form v-if="session.choices.length && !session.result" @submit.prevent="prepare">
      <fieldset :disabled="disabled || session.busy || session.attempted">
        <label
          >Ação publicada<select v-model="skillId" aria-label="Ação publicada">
            <option value="">Selecione</option>
            <option v-for="row in session.choices" :key="row.publicationId" :value="row.skillId">
              {{ row.name }}
            </option>
          </select></label
        >
        <template v-if="selected">
          <p>{{ selected.contract.purpose }}</p>
          <p>Efeito: {{ selected.contract.effectDescription }}</p>
          <p>
            Publicação: {{ selected.publicationId }}. Aprovação:
            {{
              selected.contract.approval === "automatic"
                ? "conforme permissões vigentes"
                : "humana"
            }}.
          </p>
          <ExternalTestFields
            v-model="values"
            :fields="selected.contract.input"
            prefix="Entrada"
            :disabled="disabled || session.busy || session.attempted"
          />
          <label
            ><input v-model="confirmed" type="checkbox" />Conferi os dados e quero criar esta
            preparação.</label
          >
          <button :disabled="!confirmed">Criar preparação</button>
        </template>
      </fieldset>
    </form>
    <template v-if="session.result">
      <p role="status">
        Preparação criada: {{ session.result.operationId }}.
        {{
          session.result.requireHumanApproval
            ? "Aguarda aprovação humana separada."
            : "Execução exige confirmação separada."
        }}
      </p>
      <ConsumerOperationPanel
        :persona-id="personaId"
        kind="external"
        :reference="session.result"
        :bearer="bearer"
        :disabled="disabled || session.busy"
        :call="call"
        @bearer="emit('bearer', $event)"
        @lock="emit('lock', $event)"
        @dirty="emit('dirty', $event)"
      />
    </template>
  </section>
</template>
