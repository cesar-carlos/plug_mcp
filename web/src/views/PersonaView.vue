<script lang="ts">
export default { name: "PersonaView" };
</script>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { api } from "../api";
import { useAction } from "../composables/useAction";
import { useSessionStore } from "../stores/session";
import Page from "../components/Page.vue";
import ConfirmField from "../components/ConfirmField.vue";

const session = useSessionStore();
const { pending, error, run } = useAction();
const nomePersona = ref("");
const instrucoesPersona = ref("");
const confirmado = ref(false);

onMounted(() => {
  void run(async () => {
    await session.refreshAcesso();
    nomePersona.value = session.acesso?.nomePersona ?? "";
    instrucoesPersona.value = session.acesso?.instrucoesPersona ?? "";
  });
});

const save = async (): Promise<void> => {
  await run(async (bearer) => {
    await api.post(
      "/app/api/acesso/persona",
      {
        nomePersona: nomePersona.value,
        instrucoesPersona: instrucoesPersona.value,
        confirmadoPeloUsuario: confirmado.value,
      },
      bearer,
    );
    await session.refreshAcesso();
  });
};
</script>

<template>
  <Page
    title="Persona"
    lead="Tom e uso deste acesso. Não recorta skills nem licencia SQL."
    :error="error"
  >
    <form class="card" @submit.prevent="save">
      <label>Nome <input v-model="nomePersona" maxlength="80" /></label>
      <label>Instruções <textarea v-model="instrucoesPersona" rows="8" maxlength="4000" /></label>
      <ConfirmField v-model="confirmado" />
      <button type="submit" :disabled="pending">Gravar</button>
    </form>
  </Page>
</template>
