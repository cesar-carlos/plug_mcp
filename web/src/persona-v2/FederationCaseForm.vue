<script setup lang="ts">
import { computed } from "vue";
import type { DatasetCompositionSeeds } from "../../../src/domain/persona-v2/dataset-composition";
import type { FederationDatasetSeeds } from "../../../src/domain/persona-v2/federation-dataset";
import type { FederationTraining } from "../../../src/domain/persona-v2/federation-training";
import type { QueryDependency } from "./federation-editor";
import {
  federationCaseIsNative,
  federationCaseIsSynthetic,
  type FederationEditableCase,
} from "./federation-case-editor";
import FederationCaseExpectedFields from "./FederationCaseExpectedFields.vue";
import FederationCaseSourceSeeds from "./FederationCaseSourceSeeds.vue";
import FederationRowsEditor from "./FederationRowsEditor.vue";
import OperationNameList from "./OperationNameList.vue";

const current = defineModel<FederationEditableCase>("current", { required: true });
const datasetPublications = defineModel<Record<string, string>>("datasetPublications", {
  required: true,
});
const required = defineModel<boolean>("required", { required: true });
const removeConfirmed = defineModel<boolean>("removeConfirmed", { required: true });
const resetConfirmed = defineModel<boolean>("resetConfirmed", { required: true });
defineProps<{
  publications: QueryDependency[];
  training: FederationTraining;
  disabled: boolean;
  changed: boolean;
  caseId: string;
  api?: <T>(url: string, body?: unknown) => Promise<T>;
  base?: string;
  skillId?: string;
  revision?: number;
}>();
const emit = defineEmits<{
  resetPlan: [];
  expectedChange: [Event];
  submit: [];
  close: [];
  remove: [];
  applyDataset: [FederationDatasetSeeds | DatasetCompositionSeeds];
  lock: [boolean];
}>();
const synthetic = computed(() =>
  federationCaseIsSynthetic(current.value) ? current.value : undefined,
);
const native = computed(() => (federationCaseIsNative(current.value) ? current.value : undefined));
</script>
<template>
  <form aria-label="Editor de caso de cruzamento" @submit.prevent="emit('submit')">
    <label
      >Nome do caso de cruzamento<input v-model="current.name" required maxlength="200"
    /></label>
    <label><input v-model="required" type="checkbox" />Caso obrigatório</label>
    <p>
      O plano e as projeções deste caso ficam fixados na edição. Mudanças no contrato exigem revisar
      o caso explicitamente; não serão incorporadas automaticamente.
    </p>
    <details>
      <summary>Refazer o caso após mudança do contrato</summary>
      <label
        ><input v-model="resetConfirmed" type="checkbox" />Confirmo descartar SQL, entradas e
        resultados locais deste caso e usar o plano atual do rascunho.</label
      ><button type="button" :disabled="!resetConfirmed" @click="emit('resetPlan')">
        Refazer plano e entradas do caso
      </button>
    </details>
    <div v-for="step in current.input.plan.steps.filter((s) => s.kind === 'local')" :key="step.id">
      <h4>Consulta local {{ step.id }}</h4>
      <label
        >SQL sintético de {{ step.id }}<textarea v-model="step.sql" required maxlength="30000" />
      </label>
      <OperationNameList
        :model-value="Object.keys(step.params)"
        :label="`Nomes dos parâmetros de ${step.id}`"
        @update:model-value="
          step.params = Object.fromEntries(
            $event.map((name) => [name, name in step.params ? step.params[name]! : '']),
          )
        "
      />
      <FederationRowsEditor
        :model-value="[step.params]"
        :columns="Object.keys(step.params)"
        :label="`Parâmetros de ${step.id}`"
        single
        @update:model-value="step.params = $event[0]!"
      />
    </div>
    <div v-for="fixture in synthetic?.input.fixtures ?? []" :key="fixture.stepId">
      <h4>Entrada {{ fixture.stepId }}</h4>
      <p>Colunas na ordem: {{ fixture.columns.join(", ") }}</p>
      <label
        ><input v-model="fixture.truncated" type="checkbox" />Entrada
        {{ fixture.stepId }} truncada</label
      >
      <FederationRowsEditor
        v-model="fixture.rows"
        :columns="fixture.columns"
        :label="`Entrada ${fixture.stepId}`"
      />
    </div>
    <template v-if="native">
      <FederationCaseSourceSeeds
        v-for="source in native.input.sources"
        :key="source.sourceId"
        v-model:dataset-publications="datasetPublications"
        :model-value="source"
        :publications="publications"
        :training="training"
        :case-id="caseId"
        :disabled="disabled"
        :editorial-origin="native.editorialOrigin"
        :api="api"
        :base="base"
        :skill-id="skillId"
        :revision="revision"
        @apply-dataset="emit('applyDataset', $event)"
        @lock="emit('lock', $event)"
      />
    </template>
    <label
      >Página do caso<input
        v-model.number="current.input.plan.page"
        type="number"
        min="1"
        max="1000000"
        required
    /></label>
    <label
      >Linhas por página do caso<input
        v-model.number="current.input.plan.pageSize"
        type="number"
        min="1"
        max="10000"
        required
    /></label>
    <label
      >Resultado esperado do cruzamento<select
        :value="'errorCode' in current.expected ? current.expected.errorCode : 'success'"
        @change="emit('expectedChange', $event)"
      >
        <option value="success">Linhas e total</option>
        <option value="INVALID_PLAN">Plano inválido</option>
        <option value="INCOMPLETE_INPUT">Entrada incompleta</option>
        <option value="BUDGET_EXCEEDED">Limite excedido</option>
      </select></label
    >
    <FederationCaseExpectedFields :model-value="current" />
    <details>
      <summary>Plano fixado do caso</summary>
      <pre>{{ JSON.stringify(current.input.plan, null, 2) }}</pre>
    </details>
    <p v-if="changed">Há alterações não salvas no caso.</p>
    <button>Salvar caso de cruzamento</button
    ><button type="button" @click="emit('close')">Fechar caso de cruzamento</button>
    <template v-if="caseId">
      ><label
        ><input v-model="removeConfirmed" type="checkbox" />Confirmo remover este caso e invalidar
        relatórios e prévias.</label
      ><button type="button" :disabled="!removeConfirmed" @click="emit('remove')">
        Remover caso de cruzamento
      </button></template
    >
  </form>
</template>
