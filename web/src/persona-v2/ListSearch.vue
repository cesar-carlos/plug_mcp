<script setup lang="ts">
import { useId } from "vue";
defineProps<{ modelValue: string; label: string; matches: number; total: number }>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const hint = useId();
</script>
<template>
  <div class="list-search">
    <label
      >{{ label
      }}<input
        type="search"
        :value="modelValue"
        :aria-describedby="hint"
        autocomplete="off"
        @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    /></label>
    <p :id="hint" role="status" aria-live="polite">
      {{ matches }} de {{ total }} registros correspondem à busca.
      <span v-if="modelValue.trim() && !matches"
        >Nenhum resultado. Limpe a busca ou use outro nome.</span
      >
    </p>
    <button
      v-if="modelValue"
      type="button"
      class="secondary"
      :aria-label="`Limpar ${label.toLocaleLowerCase('pt-BR')}`"
      @click="emit('update:modelValue', '')"
    >
      Limpar busca
    </button>
  </div>
</template>
