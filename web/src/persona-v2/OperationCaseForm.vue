<script setup lang="ts">
import {
  operationCaseExpectedKind,
  operationCaseExpectedResult,
  operationCaseParameterType,
  writeOperationCaseOperationId,
  writeOperationCaseStepSql,
  type OperationCase,
  type OperationCaseDatasetSeeds,
} from "./operation-cases";
import type { OperationTraining } from "./operation-editor";
import DirectOperationDatasetPicker from "./DirectOperationDatasetPicker.vue";
import OperationCaseTables from "./OperationCaseTables.vue";
import OperationDatasetPicker from "./OperationDatasetPicker.vue";
import OperationScalarInput from "./OperationScalarInput.vue";

const current = defineModel<OperationCase>("current", { required: true });
const required = defineModel<boolean>("required", { required: true });
const removeConfirmed = defineModel<boolean>("removeConfirmed", { required: true });
defineProps<{
  training: OperationTraining;
  disabled: boolean;
  dirty: boolean;
  caseId: string;
  api?: <T>(url: string, body?: unknown) => Promise<T>;
  base?: string;
  skillId?: string;
  revision?: number;
}>();
const emit = defineEmits<{
  submit: [];
  close: [];
  remove: [];
  applyDataset: [OperationCaseDatasetSeeds];
  lock: [boolean];
}>();
</script>
<template>
  <form aria-label="Editor de caso SQL" @submit.prevent="emit('submit')">
    <label>Nome do caso SQL<input v-model="current.name" required maxlength="200" /></label>
    <label><input v-model="required" type="checkbox" />Caso obrigatório</label>
    <OperationScalarInput
      v-for="(value, name) in current.input.parameters"
      :key="name"
      :model-value="value"
      :type="operationCaseParameterType(training, name, value)"
      :label="`Parâmetro ${name}`"
      @update:model-value="current.input.parameters[name] = $event"
    />
    <label
      >UUID sintético do marcador (opcional)<input
        :value="current.input.operationId"
        @input="writeOperationCaseOperationId(current, ($event.target as HTMLInputElement).value)"
    /></label>
    <OperationCaseTables
      v-model="current.input.fixtures"
      :training="training"
      title="Sementes"
      fixtures
    />
    <DirectOperationDatasetPicker
      v-if="api && base && skillId && revision"
      :key="`direct-${caseId || 'new'}`"
      :api="api"
      :base="base"
      :skill-id="skillId"
      :revision="revision"
      :source-id="training.sourceId"
      :disabled="disabled"
      @choose="emit('applyDataset', $event)"
      @composition="emit('applyDataset', $event)"
      @lock="emit('lock', $event)"
    />
    <OperationDatasetPicker
      v-if="api && base && skillId && revision"
      :key="caseId || 'new'"
      :api="api"
      :base="base"
      :skill-id="skillId"
      :revision="revision"
      :source-id="training.sourceId"
      :disabled="disabled"
      @choose="emit('applyDataset', $event)"
      @lock="emit('lock', $event)"
    />
    <p v-if="current.editorialOrigin" class="field-help">
      Sementes com origem editorial registrada. A gravação reconfere a origem e calcula se houve
      alteração; isso não aprova o caso.
    </p>
    <label
      >Resultado esperado<select
        :value="operationCaseExpectedKind(current.expected)"
        @change="
          current.expected = operationCaseExpectedResult(($event.target as HTMLSelectElement).value)
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
              writeOperationCaseStepSql(
                current,
                step.id,
                ($event.target as HTMLTextAreaElement).value,
              )
            "
          />
        </label>
      </div>
    </details>
    <p v-if="dirty">Há alterações não salvas no caso.</p>
    <button>Salvar caso SQL</button>
    <button type="button" @click="emit('close')">Fechar edição do caso</button>
    <template v-if="caseId"
      ><label
        ><input v-model="removeConfirmed" type="checkbox" />Confirmo remover este caso do
        rascunho</label
      ><button type="button" :disabled="!removeConfirmed" @click="emit('remove')">
        Remover caso SQL
      </button></template
    >
  </form>
</template>
