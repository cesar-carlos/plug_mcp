<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { readExternalValues } from "./external-test-values";
const value = defineModel<string | number | boolean>({ required: true });
const emit = defineEmits<{ dirty: [boolean] }>();
const type = ref<"string" | "number" | "boolean">(
    typeof value.value as "string" | "number" | "boolean",
  ),
  text = ref(String(value.value)),
  error = ref("");
const pending = computed(
  () => type.value !== typeof value.value || text.value !== String(value.value),
);
watch(pending, (v) => emit("dirty", v));
watch(value, (v) => {
  type.value = typeof v as typeof type.value;
  text.value = String(v);
  error.value = "";
});
function apply() {
  try {
    value.value = readExternalValues(
      {
        value: {
          type: type.value,
          required: true,
          classification: "livre",
          purpose: "Estado esperado",
        },
      },
      { value: { enabled: true, value: text.value } },
    ).value!;
    error.value = "";
  } catch {
    error.value =
      "Informe valor compatível. Números devem ser finitos e inteiros seguros; decimal exato usa texto.";
  }
}
</script>
<template>
  <fieldset>
    <legend>Estado que comprova a aplicação</legend>
    <label
      >Tipo do estado esperado<select v-model="type">
        <option value="string">Texto</option>
        <option value="number">Número</option>
        <option value="boolean">Booleano</option>
      </select></label
    ><label>Valor do estado esperado<input v-model="text" maxlength="8192" /></label
    ><button type="button" :disabled="!pending" @click="apply">Aplicar estado esperado</button>
    <p v-if="pending">Aplique o valor antes de salvar o contrato.</p>
    <p v-if="error" role="alert">{{ error }}</p>
  </fieldset>
</template>
