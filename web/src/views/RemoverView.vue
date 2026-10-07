<script lang="ts">
export default { name: "RemoverView" };
</script>

<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { api } from "../api";
import { useAction } from "../composables/useAction";
import { useSessionStore } from "../stores/session";
import Page from "../components/Page.vue";
import ConfirmField from "../components/ConfirmField.vue";

const router = useRouter();
const session = useSessionStore();
const { pending, error, run } = useAction();
const confirmado = ref(false);

const remove = async (): Promise<void> => {
  await run(async (bearer) => {
    await api.post("/app/api/acesso/remover", { confirmadoPeloUsuario: confirmado.value }, bearer);
    session.clear();
    await router.push({ name: "conectar" });
  });
};
</script>

<template>
  <Page
    title="Remover acesso"
    lead="Apaga esta persona e o catálogo. Não apaga outro Bearer."
    :error="error"
  >
    <form class="card" @submit.prevent="remove">
      <ConfirmField v-model="confirmado" label="Confirmo apagar esta persona e o catálogo" />
      <button class="danger" type="submit" :disabled="pending">Remover</button>
    </form>
  </Page>
</template>
