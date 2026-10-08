<script setup lang="ts">
withDefaults(
  defineProps<{
    modelValue: string;
    label?: string;
    rows?: number;
    required?: boolean;
    disabled?: boolean;
  }>(),
  { label: "SQL modelo", rows: 8 },
);
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
</script>
<template>
  <label
    >{{ label
    }}<textarea
      :value="modelValue"
      class="sql"
      :rows="rows"
      :required="required"
      :disabled="disabled"
      spellcheck="false"
      autocapitalize="off"
      autocomplete="off"
      @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
    />
  </label>
</template>
