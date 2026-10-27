<script setup lang="ts">
import type { TrainingStep } from "./federation-editor";
import { federationColumnChoices } from "./federation-step-editor";

const step = defineModel<Extract<TrainingStep, { kind: "project" }>>({ required: true });
defineProps<{ previous: TrainingStep[] }>();
</script>
<template>
  <label
    >Etapa de entrada<select v-model="step.input" required>
      <option value="">Selecione</option>
      <option v-for="s in previous" :key="s.id" :value="s.id">
        {{ s.id }}
      </option>
      <option v-if="step.input && !previous.some((s) => s.id === step.input)" :value="step.input">
        {{ step.input }} · referência inválida
      </option>
    </select></label
  >
  <div v-for="(column, k) in step.columns" :key="k">
    <label
      >Campo {{ k + 1
      }}<select v-model="column.column" required>
        <option value="">Selecione</option>
        <option
          v-for="c in federationColumnChoices(
            previous,
            step.input,
            column.column ? [column.column] : [],
          )"
          :key="c"
          :value="c"
        >
          {{ c }}
        </option>
      </select></label
    >
    <label
      >Nome de saída {{ k + 1 }}<input v-model="column.as" required pattern="[a-z][a-z0-9_]*"
    /></label>
    <button type="button" @click="step.columns.splice(k, 1)">Remover projeção {{ k + 1 }}</button>
  </div>
  <button
    type="button"
    :disabled="step.columns.length >= 200"
    @click="step.columns.push({ column: '', as: '' })"
  >
    Adicionar projeção
  </button>
</template>
