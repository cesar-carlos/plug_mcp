<script setup lang="ts">
import type { TrainingStep } from "./federation-editor";

const step = defineModel<Extract<TrainingStep, { kind: "union" }>>({ required: true });
defineProps<{ previous: TrainingStep[] }>();
</script>
<template>
  <label
    >Etapas para união<select v-model="step.inputs" multiple required>
      <option v-for="s in previous" :key="s.id" :value="s.id">
        {{ s.id }}
      </option>
      <option
        v-for="missing in step.inputs.filter((id) => !previous.some((s) => s.id === id))"
        :key="missing"
        :value="missing"
      >
        {{ missing }} · referência inválida
      </option>
    </select></label
  >
  <p>As entradas devem ter projeções compatíveis. A ordem selecionada faz parte do contrato.</p>
</template>
