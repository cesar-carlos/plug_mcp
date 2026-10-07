<script lang="ts">
export default { name: "DialetoView" };
</script>

<script setup lang="ts">
import { ref } from "vue";
import { api } from "../api";
import { useAction } from "../composables/useAction";
import { useSessionStore } from "../stores/session";
import Page from "../components/Page.vue";
import DialetoSelect from "../components/DialetoSelect.vue";
import ConfirmField from "../components/ConfirmField.vue";

const session = useSessionStore();
const { pending, error, run } = useAction();
const dialeto = ref(session.acesso?.dialeto ?? "mssql");
const confirmado = ref(false);

const save = async (): Promise<void> => {
  await run(async (bearer) => {
    await api.post(
      "/app/api/acesso/dialeto",
      { dialeto: dialeto.value, confirmadoPeloUsuario: confirmado.value },
      bearer,
    );
    await session.refreshAcesso();
  });
};
</script>

<template>
  <Page
    title="Dialeto"
    lead="Trocar o dialeto devolve as skills a rascunho. A tela não infere o GDBR."
    :error="error"
  >
    <form class="card" @submit.prevent="save">
      <DialetoSelect v-model="dialeto" />
      <ConfirmField v-model="confirmado" />
      <button type="submit" :disabled="pending">Alterar</button>
    </form>
  </Page>
</template>
