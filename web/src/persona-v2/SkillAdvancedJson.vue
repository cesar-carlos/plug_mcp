<script setup lang="ts">
defineProps<{
  summary: string;
  label: string;
  editLabel: string;
  applyLabel: string;
  closeLabel: string;
  value: unknown;
  disabled?: boolean;
}>();
const json = defineModel<string>("json", { required: true });
const open = defineModel<boolean>("open", { required: true });
const emit = defineEmits<{ apply: [] }>();
</script>
<template>
  <details>
    <summary>{{ summary }}</summary>
    <button
      type="button"
      :disabled="disabled"
      @click="
        json = JSON.stringify(value, null, 2);
        open = true;
      "
    >
      {{ editLabel }}
    </button>
    <template v-if="open"
      ><label>{{ label }}<textarea v-model="json" /></label
      ><button type="button" @click="emit('apply')">{{ applyLabel }}</button
      ><button type="button" @click="open = false">{{ closeLabel }}</button></template
    >
  </details>
</template>
