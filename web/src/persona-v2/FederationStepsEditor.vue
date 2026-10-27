<script setup lang="ts">
import { ref } from "vue";
import type { QueryDependency, TrainingStep } from "./federation-editor";
import { newStep } from "./federation-editor";
import {
  federationStepLabels,
  moveFederationStep,
  nextFederationStepId,
} from "./federation-step-editor";
import FederationLocalStepFields from "./FederationLocalStepFields.vue";
import FederationJoinStepFields from "./FederationJoinStepFields.vue";
import FederationUnionStepFields from "./FederationUnionStepFields.vue";
import FederationProjectStepFields from "./FederationProjectStepFields.vue";
import FederationAggregateStepFields from "./FederationAggregateStepFields.vue";
import FederationSortStepFields from "./FederationSortStepFields.vue";

const props = defineProps<{ modelValue: TrainingStep[]; publications: QueryDependency[] }>();
const emit = defineEmits<{ "update:modelValue": [TrainingStep[]] }>();
const kind = ref<TrainingStep["kind"]>("local");

function add(): void {
  emit("update:modelValue", [
    ...props.modelValue,
    newStep(kind.value, nextFederationStepId(props.modelValue)),
  ]);
}
function move(index: number, offset: number): void {
  const steps = moveFederationStep(props.modelValue, index, offset);
  if (!steps) {
    return;
  }
  emit("update:modelValue", steps);
}
</script>
<template>
  <fieldset>
    <legend>Etapas do cruzamento</legend>
    <p>
      Selecione pelo menos duas bases com consultas publicadas. Referências usam somente etapas
      anteriores. Alterar a ordem ou uma publicação exige revisar casos e dependências.
    </p>
    <article v-for="(step, i) in modelValue" :key="i" :aria-label="`Etapa ${i + 1}`">
      <h4>{{ i + 1 }}. {{ federationStepLabels[step.kind] }}</h4>
      <label
        >Identificador da etapa<input
          v-model="step.id"
          required
          pattern="[a-z][a-z0-9_]*"
          maxlength="100"
      /></label>
      <button type="button" :disabled="i === 0" @click="move(i, -1)">
        Subir etapa {{ i + 1 }}
      </button>
      <button type="button" :disabled="i === modelValue.length - 1" @click="move(i, 1)">
        Descer etapa {{ i + 1 }}
      </button>
      <button
        type="button"
        @click="
          emit(
            'update:modelValue',
            modelValue.filter((_, n) => n !== i),
          )
        "
      >
        Remover etapa {{ i + 1 }}
      </button>
      <FederationLocalStepFields
        v-if="step.kind === 'local'"
        :model-value="step"
        :publications="publications"
      />
      <FederationJoinStepFields
        v-else-if="step.kind === 'join'"
        :model-value="step"
        :previous="modelValue.slice(0, i)"
      />
      <FederationUnionStepFields
        v-else-if="step.kind === 'union'"
        :model-value="step"
        :previous="modelValue.slice(0, i)"
      />
      <FederationProjectStepFields
        v-else-if="step.kind === 'project'"
        :model-value="step"
        :previous="modelValue.slice(0, i)"
      />
      <FederationAggregateStepFields
        v-else-if="step.kind === 'aggregate'"
        :model-value="step"
        :previous="modelValue.slice(0, i)"
      />
      <FederationSortStepFields
        v-else-if="step.kind === 'sort'"
        :model-value="step"
        :previous="modelValue.slice(0, i)"
      />
    </article>
    <label
      >Nova etapa<select v-model="kind">
        <option v-for="(label, value) in federationStepLabels" :key="value" :value="value">
          {{ label }}
        </option>
      </select></label
    >
    <button type="button" :disabled="modelValue.length >= 8" @click="add">
      Adicionar etapa ao cruzamento
    </button>
  </fieldset>
</template>
