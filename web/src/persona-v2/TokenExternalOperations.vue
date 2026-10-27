<script setup lang="ts">
import type { TokenLabeledOption } from "./token-editor-options";

defineProps<{
  options: readonly TokenLabeledOption[];
}>();
const selected = defineModel<string[]>({ required: true });
</script>
<template>
  <fieldset v-if="options.length">
    <legend>Operações externas autorizadas</legend>
    <p>Executar exige a operação e a skill concedidas. Remover uma delas bloqueia o uso.</p>
    <label v-for="option in options" :key="option.id" class="check">
      <input v-model="selected" type="checkbox" :value="option.id" />
      {{ option.label }}
    </label>
  </fieldset>
</template>
