<script lang="ts">
export default { name: "AdicionarPersonaView" };
</script>

<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { completeSetup } from "../composables/useSetupForm";
import { useAction } from "../composables/useAction";
import { useSessionStore } from "../stores/session";
import Page from "../components/Page.vue";
import CredentialFields from "../components/CredentialFields.vue";
import DialetoSelect from "../components/DialetoSelect.vue";
import ConfirmField from "../components/ConfirmField.vue";

const router = useRouter();
const session = useSessionStore();
const { pending, error, run } = useAction();
const credenciais = ref({ email: "", senha: "" });
const agentId = ref("");
const dialeto = ref("mssql");
const clientToken = ref("");
const nomeAmigavel = ref("");
const confirmado = ref(false);

const save = async (): Promise<void> => {
  await run(async (bearer) => {
    if (!confirmado.value) {
      throw new Error("Confirme a operação.");
    }
    const result = await completeSetup(
      "/app/api/setup/adicionar",
      {
        email: credenciais.value.email,
        senha: credenciais.value.senha,
        agentId: agentId.value,
        dialeto: dialeto.value,
        clientToken: clientToken.value,
        nomeAmigavel: nomeAmigavel.value,
      },
      bearer,
    );
    if (result.token) {
      session.holdIssued(result.token);
      await router.push({ name: "bearer" });
    }
  });
};
</script>

<template>
  <Page
    title="Outra persona"
    lead="Catálogo vazio e Bearer próprio. Esta aba continua na persona atual até você colar o Bearer novo."
    :error="error"
  >
    <form class="card" @submit.prevent="save">
      <CredentialFields v-model="credenciais" />
      <label>Agente (UUID) <input v-model="agentId" required /></label>
      <DialetoSelect v-model="dialeto" />
      <label>client_token <input v-model="clientToken" type="password" required /></label>
      <label>Nome <input v-model="nomeAmigavel" /></label>
      <ConfirmField v-model="confirmado" />
      <button type="submit" :disabled="pending">Criar persona</button>
    </form>
  </Page>
</template>
