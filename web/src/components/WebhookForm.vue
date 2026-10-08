<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { EntregaItem } from "../api";
import type { WebhookConfigurarPayload, WebhookRearmarPayload } from "../form-payloads";
import { askConfirmation } from "../confirmation";
import ConfirmField from "./ConfirmField.vue";
const props = defineProps<{ entregas: EntregaItem[]; pending?: boolean; revision?: number }>();
const url = ref("");
const segredo = ref("");
const eventoId = ref("");
const confirmado = ref(false);
const confirmaReenvio = ref(false);
const originalUrl = ref("");
const dirty = computed(() => url.value !== originalUrl.value || Boolean(segredo.value));
defineExpose({ dirty });
watch(
  () => props.revision,
  () => {
    originalUrl.value = url.value;
  },
);
watch(
  [url, segredo],
  () => {
    confirmado.value = false;
  },
  { flush: "sync" },
);
watch(
  eventoId,
  () => {
    confirmaReenvio.value = false;
  },
  { flush: "sync" },
);
const deadLetters = computed(() => props.entregas.filter((item) => item.deadLetter));
const emit = defineEmits<{
  configurar: [payload: WebhookConfigurarPayload];
  rearmar: [payload: WebhookRearmarPayload];
}>();
const configurar = async (): Promise<void> => {
  if (!confirmado.value || props.pending) {
    return;
  }
  const accepted = await askConfirmation({
    title: "Configurar webhook?",
    message: `Confirma configurar o destino HTTPS “${url.value}” para eventos operacionais deste acesso?`,
    action: "Salvar webhook",
  });
  if (accepted) {
    emit("configurar", {
      url: url.value || undefined,
      segredo: segredo.value || undefined,
      ativo: true,
      confirmadoPeloUsuario: accepted,
    });
    segredo.value = "";
    confirmado.value = false;
  }
};
const rearmar = async (): Promise<void> => {
  if (!confirmaReenvio.value || props.pending || !eventoId.value) {
    return;
  }
  const accepted = await askConfirmation({
    title: "Reenviar entrega?",
    message: "Esta entrega sairá da fila de falhas permanentes e poderá ser enviada novamente.",
    action: "Reenviar entrega",
  });
  if (accepted) {
    emit("rearmar", { eventoId: eventoId.value, confirmadoPeloUsuario: accepted });
    confirmaReenvio.value = false;
  }
};
</script>
<template>
  <form class="card" @submit.prevent="configurar">
    <h2>Webhook operacional</h2>
    <label>URL HTTPS<input v-model="url" type="url" required /></label
    ><label>Segredo<input v-model="segredo" type="password" autocomplete="off" /></label>
    <p class="hint">Destino HTTPS público. URL e segredo não são devolvidos pelo servidor.</p>
    <ConfirmField v-model="confirmado" label="Confirmo configurar este destino de webhook" />
    <div class="form-actions">
      <button type="submit" :disabled="pending || !confirmado">Revisar configuração</button>
    </div>
  </form>
  <form class="card" @submit.prevent="rearmar">
    <h2>Reenviar entrega com falha permanente</h2>
    <p v-if="!deadLetters.length" class="empty">Nenhuma entrega em falha permanente.</p>
    <template v-else
      ><label
        >Entrega<select v-model="eventoId" required>
          <option value="">Selecione uma entrega</option>
          <option v-for="(entrega, index) in deadLetters" :key="entrega.id" :value="entrega.id">
            Entrega {{ index + 1 }} · {{ entrega.id.slice(0, 8) }}
          </option>
        </select></label
      ><ConfirmField v-model="confirmaReenvio" label="Confirmo reenviar a entrega selecionada" />
      <div class="form-actions">
        <button type="submit" :disabled="pending || !confirmaReenvio">Revisar reenvio</button>
      </div></template
    >
  </form>
</template>
