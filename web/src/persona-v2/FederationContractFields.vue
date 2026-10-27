<script setup lang="ts">
import type { FederationTraining } from "../../../src/domain/persona-v2/federation-training";
import FederationStepsEditor from "./FederationStepsEditor.vue";
import LimitsEditor from "./LimitsEditor.vue";
import { federationSemanticsLabels, type QueryDependency } from "./federation-editor";

const training = defineModel<FederationTraining>({ required: true });
defineProps<{ publications: QueryDependency[] }>();
</script>
<template>
  <label
    >Finalidade do cruzamento<textarea v-model="training.purpose" required maxlength="4000" />
  </label>
  <fieldset>
    <legend>Significado da combinação</legend>
    <label v-for="(label, key) in federationSemanticsLabels" :key="key"
      >{{ label }}<textarea v-model="training.semantics[key]" required />
    </label>
  </fieldset>
  <FederationStepsEditor v-model="training.steps" :publications="publications" />
  <label
    >Etapa de saída<select v-model="training.output" required>
      <option value="">Selecione</option>
      <option v-for="step in training.steps" :key="step.id" :value="step.id">
        {{ step.id }}
      </option>
      <option
        v-if="training.output && !training.steps.some((s) => s.id === training.output)"
        :value="training.output"
      >
        {{ training.output }} · referência inválida
      </option>
    </select></label
  >
  <LimitsEditor
    :model-value="training.budget"
    kind="federation"
    label="Limites do cruzamento"
    @update:model-value="training.budget = $event ?? {}"
  />
</template>
