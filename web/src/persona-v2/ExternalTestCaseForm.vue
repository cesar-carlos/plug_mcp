<script setup lang="ts">
import type { ExternalContract } from "../../../src/domain/persona-v2/external-contract";
import ExternalTestFields from "./ExternalTestFields.vue";
import type { ExternalTestValue } from "./external-test-values";

defineProps<{
  contract: ExternalContract;
  caseId: string;
  dirty: boolean;
  disabled: boolean;
}>();
const name = defineModel<string>("name", { required: true });
const required = defineModel<boolean>("required", { required: true });
const input = defineModel<Record<string, ExternalTestValue>>("input", { required: true });
const expected = defineModel<Record<string, ExternalTestValue>>("expected", { required: true });
const removeConfirmed = defineModel<boolean>("removeConfirmed", { required: true });
const emit = defineEmits<{
  submit: [];
  close: [];
  remove: [];
}>();
</script>
<template>
  <form aria-label="Editor de caso externo" @submit.prevent="emit('submit')">
    <label
      >Nome do caso<input v-model="name" required maxlength="200" :disabled="disabled"
    /></label>
    <label><input v-model="required" type="checkbox" :disabled="disabled" />Caso obrigatório</label>
    <ExternalTestFields
      v-model="input"
      :fields="contract.input"
      prefix="Entrada"
      :disabled="disabled"
    />
    <ExternalTestFields
      v-model="expected"
      :fields="contract.output"
      prefix="Saída esperada"
      :disabled="disabled"
    />
    <p v-if="dirty">Há alterações não salvas.</p>
    <button :disabled="disabled">Salvar caso externo</button>
    <button type="button" :disabled="disabled" @click="emit('close')">Fechar caso externo</button>
    <template v-if="caseId"
      ><label
        ><input v-model="removeConfirmed" type="checkbox" :disabled="disabled" />Confirmo remover
        este caso</label
      ><button
        type="button"
        class="danger"
        :disabled="disabled || !removeConfirmed"
        @click="emit('remove')"
      >
        Remover caso externo
      </button></template
    >
  </form>
</template>
