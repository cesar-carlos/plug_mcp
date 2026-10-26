<script setup lang="ts">
import { computed, reactive, useId, watch } from "vue";
import type { Persona } from "./model";

const props = defineProps<{
  persona: Persona;
  busy: boolean;
  embedded?: boolean;
  errorFields?: readonly string[];
}>();
const errorId = useId();
const invalid = (field: string) => props.errorFields?.includes(field) || undefined;
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
  <component :is="embedded ? 'div' : 'details'">
    <summary v-if="!embedded">Editar persona</summary>
    <form aria-label="Editar persona" @submit.prevent="save">
      <fieldset :disabled="busy">
        <label
          >Nome<input
            v-model="form.name"
            maxlength="200"
            required
            data-error-field="overview:name"
            :aria-invalid="invalid('name')"
            :aria-describedby="invalid('name') ? `${errorId}-name` : undefined"
        /></label>
        <p v-if="invalid('name')" :id="`${errorId}-name`" class="error">
          Revise o nome e salve novamente.
        </p>
        <label
          >Especialidade<textarea
            v-model="form.specialty"
            maxlength="5000"
            required
            data-error-field="overview:specialty"
            :aria-invalid="invalid('specialty')"
            :aria-describedby="invalid('specialty') ? `${errorId}-specialty` : undefined"
          />
        </label>
        <p v-if="invalid('specialty')" :id="`${errorId}-specialty`" class="error">
          Revise a especialidade e salve novamente.
        </p>
        <label
          >Orientações<textarea
            v-model="form.instructions"
            maxlength="20000"
            data-error-field="overview:instructions"
            :aria-invalid="invalid('instructions')"
            :aria-describedby="invalid('instructions') ? `${errorId}-instructions` : undefined"
          />
        </label>
        <p v-if="invalid('instructions')" :id="`${errorId}-instructions`" class="error">
          Revise as orientações e salve novamente.
        </p>
        <button :disabled="!dirty">Salvar persona</button>
      </fieldset>
    </form>
  </component>
</template>
