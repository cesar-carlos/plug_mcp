<script lang="ts">
export default { name: "VerificarView" };
</script>

<script setup lang="ts">
import { ref } from "vue";
import { api } from "../api";
import { useAction } from "../composables/useAction";
import { useSessionStore } from "../stores/session";
import Page from "../components/Page.vue";
import JsonBlock from "../components/JsonBlock.vue";

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
    lead="Consulta o pedido de acesso e a policy do client_token. Não faça polling agressivo."
    :error="error"
  >
    <button :disabled="pending" @click="verificar">Verificar agora</button>
    <JsonBlock v-if="result" :value="result" />
  </Page>
</template>
