<script setup lang="ts">
import type { TrainingCase } from "../../../src/domain/persona-v2/catalog";
import type {
  FederationCase,
  FederationPublicationCase,
  FederationTraining,
} from "../../../src/domain/persona-v2/federation-training";
import type { QueryDependency } from "./federation-editor";
import FederationCaseForm from "./FederationCaseForm.vue";
import { useFederationCases } from "./use-federation-cases";

const props = defineProps<{
  training: FederationTraining;
  publications: QueryDependency[];
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
  save: [
    {
      id?: string;
      remove: boolean;
      required: boolean;
      content: FederationCase | FederationPublicationCase;
    },
  ];
}>();
const {
  current,
  id,
  required,
  removeConfirmed,
  resetConfirmed,
  mode,
  datasetPublications,
  changed,
  error,
  errorSummary,
  edit,
  close,
  submit,
  resetPlan,
  expectedChange,
  applyDataset,
} = useFederationCases(props, emit);
</script>
<template>
  <section aria-label="Casos do cruzamento">
    <h3>Casos de publicação do cruzamento</h3>
    <p>
      As entradas sintéticas testam a combinação; não comprovam dados reais nem os três motores. O
      runner de operador registra relatórios em ambiente isolado. Este formulário não executa SQL.
    </p>
    <p v-if="error" ref="errorSummary" role="alert" tabindex="-1" class="error">{{ error }}</p>
    <fieldset :disabled="disabled">
      <ul>
        <li v-for="test in cases" :key="test.id">
          {{ (test.content as FederationCase).name }} ·
          {{ test.required ? "obrigatório" : "opcional"
          }}<button type="button" @click="edit(test)">
            Editar caso {{ (test.content as FederationCase).name }}
          </button>
        </li>
      </ul>
      <label
        >Tipo do novo caso<select v-model="mode">
          <option value="transport">SQL pelo transporte em fixtures isoladas</option>
          <option value="synthetic">Somente combinação sintética</option>
        </select></label
      >
      <button type="button" @click="edit()">Adicionar caso de cruzamento</button>
      <FederationCaseForm
        v-if="current"
        v-model:current="current"
        v-model:dataset-publications="datasetPublications"
        v-model:required="required"
        v-model:remove-confirmed="removeConfirmed"
        v-model:reset-confirmed="resetConfirmed"
        :publications="publications"
        :training="training"
        :disabled="disabled"
        :changed="changed"
        :case-id="id"
        :api="api"
        :base="base"
        :skill-id="skillId"
        :revision="revision"
        @reset-plan="resetPlan"
        @expected-change="expectedChange"
        @submit="submit()"
        @close="close"
        @remove="submit(true)"
        @apply-dataset="applyDataset"
        @lock="emit('lock', $event)"
      />
    </fieldset>
  </section>
</template>
