<script setup lang="ts">
import PersonaCreateForm from "./PersonaCreateForm.vue";

defineProps<{
  active: boolean;
  hasPersonas: boolean;
  busy: boolean;
  invalidField: (field: string) => boolean;
}>();
const open = defineModel<boolean>("open", { required: true });
const name = defineModel<string>("name", { required: true });
const specialty = defineModel<string>("specialty", { required: true });
const instructions = defineModel<string>("instructions", { required: true });
const emit = defineEmits<{
  submit: [];
  icon: [file: File | undefined];
}>();
</script>
<template>
  <p v-if="!hasPersonas && active" class="notice">
    Comece criando sua primeira persona. Você poderá conectar as bases depois.
  </p>
  <button v-if="!hasPersonas && active" @click="open = true">Criar primeira persona</button>
  <details v-show="active" :open="open" @toggle="open = ($event.target as HTMLDetailsElement).open">
    <summary>Criar uma persona</summary>
    <PersonaCreateForm
      v-model:name="name"
      v-model:specialty="specialty"
      v-model:instructions="instructions"
      :busy="busy"
      :invalid-field="invalidField"
      @submit="emit('submit')"
      @icon="emit('icon', $event)"
    />
  </details>
</template>
