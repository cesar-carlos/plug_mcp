<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { z } from "zod";
import type { operationCaseSchema } from "../../../src/application/persona-v2/operation-cases";
import type { TrainingCase } from "../../../src/domain/persona-v2/catalog";
import { scalar, type OperationTraining } from "./operation-editor";
import OperationScalarInput from "./OperationScalarInput.vue";
import OperationCaseTables from "./OperationCaseTables.vue";
type Case = z.infer<typeof operationCaseSchema>;
const props = defineProps<{
  training: OperationTraining;
  cases: readonly TrainingCase[];
  disabled: boolean;
  confirmDiscard: () => Promise<boolean>;
}>();
const emit = defineEmits<{
  dirty: [boolean];
  save: [{ id?: string; remove: boolean; required: boolean; content: Case }];
}>();
const current = ref<Case>(),
  id = ref(""),
  required = ref(true),
  saved = ref(""),
  removeConfirmed = ref(false);
const fingerprint = computed(() =>
  JSON.stringify({ required: required.value, content: current.value }),
);
const dirty = computed(
  () => (!!current.value && fingerprint.value !== saved.value) || removeConfirmed.value,
);
watch(dirty, (v) => emit("dirty", v));
async function edit(test?: TrainingCase) {
  if (dirty.value && !(await props.confirmDiscard())) return;
  id.value = test?.id ?? "";
  required.value = test?.required ?? true;
  removeConfirmed.value = false;
  current.value = test
    ? (JSON.parse(JSON.stringify(test.content)) as Case)
    : {
        name: "",
        input: {
          parameters: Object.fromEntries(
            props.training.parameters.map((p) => [p.name, scalar(p.type)]),
          ),
          fixtures: [],
        },
        expected: { affectedRows: 1, tables: [] },
      };
  saved.value = fingerprint.value;
}
function submit(remove = false) {
  if (current.value && (!remove || removeConfirmed.value))
    emit("save", {
      ...(id.value ? { id: id.value } : {}),
      remove,
      required: required.value,
      content: current.value,
    });
}
async function close() {
  if (dirty.value && !(await props.confirmDiscard())) return;
  current.value = undefined;
  removeConfirmed.value = false;
}
</script>
<template>
  <section aria-label="Casos da operação SQL">
    <h3>Casos sintéticos de publicação</h3>
    <p>
      O runner de operador usa fixtures isoladas. Este editor não executa SQL nem aprova relatórios.
      SQL adaptável exige sucesso e recusa de plano; conciliação exige caso com marcador.
    </p>
    <fieldset :disabled="disabled">
      <ul>
        <li v-for="test in cases" :key="test.id">
          {{ (test.content as Case).name }} · {{ test.required ? "obrigatório" : "opcional" }}
          <button type="button" @click="edit(test)">
            Editar caso {{ (test.content as Case).name }}
          </button>
        </li>
      </ul>
      <button type="button" @click="edit()">Adicionar caso SQL</button>
      <form v-if="current" aria-label="Editor de caso SQL" @submit.prevent="submit()">
        <label>Nome do caso SQL<input v-model="current.name" required maxlength="200" /></label>
        <label><input v-model="required" type="checkbox" />Caso obrigatório</label>
        <OperationScalarInput
          v-for="(value, name) in current.input.parameters"
          :key="name"
          :model-value="value"
          :type="
            training.parameters.find((p) => p.name === name)?.type ??
            (value.type === 'null' ? 'string' : value.type)
          "
          :label="`Parâmetro ${name}`"
          @update:model-value="current!.input.parameters[name] = $event"
        />
        <label
          >UUID sintético do marcador (opcional)<input
            :value="current.input.operationId"
            @input="
              current.input.operationId = ($event.target as HTMLInputElement).value || undefined
            "
        /></label>
        <OperationCaseTables
          v-model="current.input.fixtures"
          :training="training"
          title="Sementes"
          fixtures
        />
        <label
          >Resultado esperado<select
            :value="'error' in current.expected ? current.expected.error : 'success'"
            @change="
              current.expected =
                ($event.target as HTMLSelectElement).value === 'success'
                  ? { affectedRows: 1, tables: [] }
                  : {
                      error: ($event.target as HTMLSelectElement).value as
                        'INVALID_PLAN' | 'NATIVE_FAILURE' | 'ROW_CONDITION_FAILED',
                    }
            "
          >
            <option value="success">Sucesso com estado final</option>
            <option value="ROW_CONDITION_FAILED">Condição de linhas recusada</option>
            <option value="NATIVE_FAILURE">Falha nativa com rollback</option>
            <option value="INVALID_PLAN">Plano recusado antes da execução</option>
          </select></label
        >
        <template v-if="'affectedRows' in current.expected">
          <label
            >Linhas diretamente afetadas esperadas<input
              v-model.number="current.expected.affectedRows"
              type="number"
              min="0"
              required
          /></label>
          <OperationCaseTables
            v-model="current.expected.tables"
            :training="training"
            title="Estado final"
          />
        </template>
        <details>
          <summary>SQL adaptado por etapa (somente casos)</summary>
          <div v-for="step in training.steps" :key="step.id">
            <label
              >SQL de {{ step.id
              }}<textarea
                :value="current.input.sqlByStep?.[step.id]"
                @input="
                  current.input.sqlByStep ??= {};
                  if (($event.target as HTMLTextAreaElement).value)
                    current.input.sqlByStep[step.id] = ($event.target as HTMLTextAreaElement).value;
                  else delete current.input.sqlByStep[step.id];
                "
              />
            </label>
          </div>
        </details>
        <p v-if="dirty">Há alterações não salvas no caso.</p>
        <button>Salvar caso SQL</button>
        <button type="button" @click="close">Fechar edição do caso</button>
        <template v-if="id"
          ><label
            ><input v-model="removeConfirmed" type="checkbox" />Confirmo remover este caso do
            rascunho</label
          ><button type="button" :disabled="!removeConfirmed" @click="submit(true)">
            Remover caso SQL
          </button></template
        >
      </form>
    </fieldset>
  </section>
</template>
