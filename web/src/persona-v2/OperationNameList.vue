<script setup lang="ts">
import { ref, watch } from "vue";
import { names } from "./operation-editor";
defineProps<{ label: string; required?: boolean }>();
const model = defineModel<string[]>({ required: true });
const text = ref(model.value.join(", "));
watch(
  model,
  (value) => {
    // Keep the comma while a composite key is still being typed.
    if (JSON.stringify(value) !== JSON.stringify(names(text.value))) text.value = value.join(", ");
  },
  { deep: true },
);
</script>
<template>
  <label
    >{{ label
    }}<input
      v-model="text"
      :required="required"
      maxlength="3300"
      @input="model = names(($event.target as HTMLInputElement).value)"
  /></label>
</template>
