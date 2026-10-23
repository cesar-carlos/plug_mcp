<script setup lang="ts">
import { computed, reactive, watch } from "vue";
import type { Persona } from "./model";

const props = defineProps<{ persona: Persona; busy: boolean }>();
const emit = defineEmits<{
  save: [input: { expectedVersion: number; name: string; specialty: string; instructions: string }];
  dirty: [value: boolean];
}>();
const initial = {
  name: props.persona.name,
  specialty: props.persona.specialty,
  instructions: props.persona.instructions,
};
const form = reactive({ ...initial });
const dirty = computed(() => JSON.stringify(form) !== JSON.stringify(initial));
watch(dirty, (value) => emit("dirty", value), { immediate: true });
function save() {
  emit("save", { ...form, expectedVersion: props.persona.authorizationVersion });
}
</script>

<template>
  <details>
    <summary>Editar persona</summary>
    <form aria-label="Editar persona" @submit.prevent="save">
      <fieldset :disabled="busy">
        <label>Nome<input v-model="form.name" maxlength="200" required /></label>
        <label>Especialidade<textarea v-model="form.specialty" maxlength="5000" required /></label>
        <label>Orientações<textarea v-model="form.instructions" maxlength="20000" /></label>
        <button :disabled="!dirty">Salvar persona</button>
      </fieldset>
    </form>
  </details>
</template>
