<script lang="ts">
export default { name: "VerificarView" };
</script>

<script setup lang="ts">
import { ref } from "vue";
import { api } from "../api";
import { useAction } from "../composables/useAction";
import { useSessionStore } from "../stores/session";
import Page from "../components/Page.vue";
import DataView from "../components/DataView.vue";

const session = useSessionStore();
const { pending, error, run } = useAction();
const result = ref<unknown>(null);

const verificar = async (): Promise<void> => {
  await run(async (bearer) => {
    result.value = await api.post("/app/api/acesso/verificar", {}, bearer);
    await session.refreshAcesso();
  });
};
</script>

<template>
  <Page
    title="Verificar no hub"
    lead="Não faça polling agressivo. Uma leitura basta para atualizar o estado SQL."
    :error="error"
  >
    <div class="card">
      <p class="hint">
        Lê o pedido de acesso e a policy do client_token neste momento. O estado “não consultado” da
        tela de acesso muda só depois desta leitura.
      </p>
      <div class="form-actions">
        <button :disabled="pending" @click="verificar">Verificar agora</button>
      </div>
    </div>
    <div v-if="result" class="card">
      <h2>Resposta do hub</h2>
      <DataView :value="result" />
    </div>
  </Page>
</template>
