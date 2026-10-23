<script setup lang="ts">
import { computed, onBeforeUnmount, shallowReactive, ref, watch } from "vue";
import { SqlPreparationSession } from "./sql-preparation";
import OperationScalarInput from "./OperationScalarInput.vue";
import { scalar } from "./operation-editor";
import type { TypedScalar } from "../../../src/domain/persona-v2/operation";
import { operationScalarSchema } from "../../../src/domain/persona-v2/operation-training";
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
  new SqlPreparationSession(props.call, () => ({
    personaId: props.personaId,
    bearer: props.bearer,
  })),
);
const skillId = ref(""),
  confirmed = ref(false),
  values = ref<Record<string, TypedScalar>>({});
const sqlByStep = ref<Record<string, string>>({});
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
  sqlByStep.value = {};
  confirmed.value = false;
  error.value = "";
  emit("dirty", false);
}
watch(() => [props.personaId, props.bearer], clear, { flush: "sync" });
watch(skillId, () => {
  values.value = Object.fromEntries(
    (selected.value?.training.parameters ?? []).map((p) => [p.name, scalar(p.type)]),
  );
  sqlByStep.value = {};
  confirmed.value = false;
});
watch(
  [values, sqlByStep],
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
    const parameters: Record<string, TypedScalar> = {};
    for (const p of selected.value.training.parameters) {
      const value = operationScalarSchema.safeParse(values.value[p.name]);
      if (
        !value.success ||
        (value.data.type !== p.type && !(p.nullable && value.data.type === "null"))
      )
        throw new Error(`Confira o parâmetro ${p.name} (${p.type}).`);
      parameters[p.name] = value.data;
    }
    const input =
      selected.value.training.mode === "sql_adaptavel"
        ? {
            parameters,
            sqlByStep: Object.fromEntries(
              Object.entries(sqlByStep.value).filter(([, sql]) => sql.trim()),
            ),
          }
        : parameters;
    confirmed.value = false;
    await session.run(selected.value, input);
    if (session.result) {
      values.value = {};
      sqlByStep.value = {};
      emit("dirty", false);
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Confira os campos.";
  }
}
</script>
<template>
  <section aria-label="Preparar operação SQL" :aria-busy="session.busy">
    <h3>Preparar operação SQL</h3>
    <p>A preparação registra os dados para revisão. Não executa SQL nem concede aprovação.</p>
    <label
      >Token do consumidor para preparar<input
        type="password"
        :value="bearer"
        autocomplete="off"
        :disabled="disabled || session.busy"
        @input="emit('bearer', ($event.target as HTMLInputElement).value)"
    /></label>
    <button class="secondary" :disabled="disabled || session.busy || !bearer" @click="load">
      Carregar operações concedidas / iniciar nova preparação
    </button>
    <p v-if="error" ref="errorSummary" tabindex="-1" role="alert">{{ error }}</p>
    <p v-if="session.loaded && !session.choices.length" role="status">
      Nenhuma operação publicada está disponível para este token.
    </p>
    <form v-if="session.choices.length && !session.result" @submit.prevent="prepare">
      <fieldset :disabled="disabled || session.busy || session.attempted">
        <label
          >Operação publicada<select v-model="skillId" aria-label="Operação publicada">
            <option value="">Selecione</option>
            <option v-for="row in session.choices" :key="row.publicationId" :value="row.skillId">
              {{ row.name }}
            </option>
          </select></label
        >
        <template v-if="selected">
          <p>{{ selected.training.purpose }}</p>
          <p>Dialeto: {{ selected.training.dialect }}. Modo: {{ selected.training.mode }}.</p>
          <p>
            Publicação: {{ selected.publicationId }}. Aprovação:
            {{
              selected.training.approval === "automatic"
                ? "conforme permissões vigentes"
                : "humana"
            }}.
          </p>
          <div v-for="p in selected.training.parameters" :key="p.name">
            <p>
              {{ p.meaning }} {{ p.nullable ? "Aceita nulo." : "Obrigatório, não aceita nulo." }}
            </p>
            <OperationScalarInput
              v-model="values[p.name]!"
              :label="p.name"
              :type="p.type"
              :allow-null="p.nullable"
            />
          </div>
          <template v-if="selected.training.mode === 'sql_adaptavel'">
            <p>
              SQL opcional por etapa. Em branco usa o modelo treinado. O servidor confere o contrato
              publicado.
            </p>
            <label v-for="step in selected.training.steps" :key="step.id">
              SQL da etapa {{ step.id }} ({{ step.effect }} em {{ step.table }})
              <textarea
                v-model="sqlByStep[step.id]"
                maxlength="30000"
                rows="4"
                spellcheck="false"
              />
            </label>
          </template>
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
        kind="sql"
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
