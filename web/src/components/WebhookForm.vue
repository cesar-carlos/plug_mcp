<script lang="ts">
export default { name: "WebhookForm" };
</script>

<script setup lang="ts">
import { computed, ref } from "vue";
import type { EntregaItem } from "../api";
import type { WebhookConfigurarPayload, WebhookRearmarPayload } from "../form-payloads";
import ConfirmField from "./ConfirmField.vue";

const props = defineProps<{ entregas: EntregaItem[] }>();

const url = ref("");
const segredo = ref("");
const eventoId = ref("");
const confirmado = ref(false);
const deadLetters = computed(() => props.entregas.filter((item) => item.deadLetter));

const emit = defineEmits<{
  configurar: [payload: WebhookConfigurarPayload];
  rearmar: [payload: WebhookRearmarPayload];
}>();

const configurar = (): void => {
  emit("configurar", {
    url: url.value || undefined,
    segredo: segredo.value || undefined,
    ativo: true,
    confirmadoPeloUsuario: confirmado.value,
  });
  segredo.value = "";
};

const rearmar = (): void => {
  emit("rearmar", {
    eventoId: eventoId.value,
    confirmadoPeloUsuario: confirmado.value,
  });
};
</script>

<template>
  <div>
    <form class="card" @submit.prevent="configurar">
      <h2>Webhook</h2>
      <label>URL HTTPS <input v-model="url" type="url" /></label>
      <label>Segredo <input v-model="segredo" type="password" autocomplete="off" /></label>
      <p class="hint">URL e segredo não voltam na resposta. Só HTTPS público.</p>
      <ConfirmField v-model="confirmado" label="Confirmo gravar esta URL de webhook" />
      <div class="form-actions">
        <button type="submit">Configurar</button>
      </div>
    </form>
    <form class="card" @submit.prevent="rearmar">
      <h2>Rearmar dead-letter</h2>
      <p v-if="deadLetters.length === 0" class="empty">Nenhuma entrega em dead-letter.</p>
      <ul v-else>
        <li v-for="entrega in deadLetters" :key="entrega.id" class="mono">{{ entrega.id }}</li>
      </ul>
      <label>eventoId <input v-model="eventoId" required class="mono" /></label>
      <div class="form-actions">
        <button type="submit">Rearmar</button>
      </div>
    </form>
  </div>
</template>
