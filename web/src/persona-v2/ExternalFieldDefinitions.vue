<script setup lang="ts">
import { ref, watch } from "vue";
import type { ExternalContract } from "../../../src/domain/persona-v2/external-contract";
const fields = defineModel<ExternalContract["input"]>({ required: true });
defineProps<{ label: string }>();
const nextName = ref(""),
  error = ref("");
const emit = defineEmits<{ dirty: [boolean] }>();
watch(nextName, (value) => emit("dirty", !!value));
function add() {
  const key = nextName.value.trim();
  if (
    !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(key) ||
    ["constructor", "prototype"].includes(key) ||
    Object.hasOwn(fields.value, key)
  ) {
    error.value = "Informe nome único de campo, começando por letra e sem caracteres especiais.";
    return;
  }
  fields.value = {
    ...fields.value,
    [key]: { type: "string", required: true, purpose: "", classification: "livre" },
  };
  nextName.value = "";
  error.value = "";
}
</script>
<template>
  <fieldset>
    <legend>{{ label }}</legend>
    <p>Somente campos livres. Campos novos não ampliam tokens; decimais exatos devem usar texto.</p>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
    <fieldset v-for="(field, key) in fields" :key="key">
      <legend>Campo {{ key }}</legend>
      <label
        >Tipo de {{ key
        }}<select v-model="field.type">
          <option value="string">Texto</option>
          <option value="number">Número</option>
          <option value="boolean">Booleano</option>
        </select></label
      >
      <label><input v-model="field.required" type="checkbox" />{{ key }} obrigatório</label>
      <label
        >Finalidade de {{ key }}<textarea v-model="field.purpose" required maxlength="1000" />
      </label>
      <button type="button" @click="delete fields[key]">Remover campo {{ key }}</button>
    </fieldset>
    <label
      >Nome do novo campo de {{ label
      }}<input v-model="nextName" maxlength="64" @input="error = ''"
    /></label>
    <button type="button" :disabled="Object.keys(fields).length >= 64" @click="add">
      Adicionar campo de {{ label }}
    </button>
  </fieldset>
</template>
