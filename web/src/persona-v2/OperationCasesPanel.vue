<script setup lang="ts">
import type { TrainingCase } from "../../../src/domain/persona-v2/catalog";
import type { OperationCase } from "./operation-cases";
import type { OperationTraining } from "./operation-editor";
import OperationCaseForm from "./OperationCaseForm.vue";
import { useOperationCases } from "./use-operation-cases";

const props = defineProps<{
  training: OperationTraining;
  cases: readonly TrainingCase[];
  disabled: boolean;
  confirmDiscard: () => Promise<boolean>;
  api?: <T>(url: string, body?: unknown) => Promise<T>;
  base?: string;
  skillId?: string;
  revision?: number;
}>();
const emit = defineEmits<{
  dirty: [boolean];
  lock: [boolean];
  save: [{ id?: string; remove: boolean; required: boolean; content: OperationCase }];
}>();
const { current, id, required, removeConfirmed, dirty, edit, close, submit, applyDataset } =
  useOperationCases(props, emit);
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
          {{ (test.content as OperationCase).name }} ·
          {{ test.required ? "obrigatório" : "opcional" }}
          <button type="button" @click="edit(test)">
            Editar caso {{ (test.content as OperationCase).name }}
          </button>
        </li>
      </ul>
      <button type="button" @click="edit()">Adicionar caso SQL</button>
      <OperationCaseForm
        v-if="current"
        v-model:current="current"
        v-model:required="required"
        v-model:remove-confirmed="removeConfirmed"
        :training="training"
        :disabled="disabled"
        :dirty="dirty"
        :case-id="id"
        :api="api"
        :base="base"
        :skill-id="skillId"
        :revision="revision"
        @submit="submit()"
        @close="close"
        @remove="submit(true)"
        @apply-dataset="applyDataset"
        @lock="emit('lock', $event)"
      />
    </fieldset>
  </section>
</template>
