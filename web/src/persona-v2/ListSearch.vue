<script setup lang="ts">
import { ref, useId } from "vue";
defineProps<{ modelValue: string; label: string; matches: number; total: number }>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const hint = useId();
const input = ref<HTMLInputElement>();
const inputId = useId();
function clear(): void {
  emit("update:modelValue", "");
  input.value?.focus();
}
</script>
<template>
  <div class="list-search">
    <label :for="inputId">{{ label }}</label>
    <div class="list-search-controls">
      <input
        :id="inputId"
        ref="input"
        type="search"
        :value="modelValue"
        :aria-describedby="hint"
        autocomplete="off"
        @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      />
      <button
        v-if="modelValue"
        type="button"
        class="secondary"
        :aria-label="`Limpar ${label.toLocaleLowerCase('pt-BR')}`"
        @click="clear"
      >
        Limpar busca
      </button>
    </div>
    <p :id="hint" role="status" aria-live="polite">
      <template v-if="modelValue.trim()"
        >{{ matches }} de {{ total }} registros correspondem à busca.</template
      >
      <template v-else
        >{{ total }} {{ total === 1 ? "registro disponível" : "registros disponíveis" }}.</template
      >
      <span v-if="modelValue.trim() && !matches"
        >Nenhum resultado. Limpe a busca ou use outro nome.</span
      >
    </p>
  </div>
</template>
