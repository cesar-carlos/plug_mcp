<script lang="ts">
export default { name: "RotacionarView" };
</script>

<script setup lang="ts">
import { ref } from "vue";
import { completeSetup } from "../composables/useSetupForm";
import { useAction } from "../composables/useAction";
import { useSessionStore } from "../stores/session";
import Page from "../components/Page.vue";
import CredentialFields from "../components/CredentialFields.vue";
import ConfirmField from "../components/ConfirmField.vue";

const session = useSessionStore();
const { pending, error, run } = useAction();
const credenciais = ref({ email: "", senha: "" });
const confirmado = ref(false);
const token = ref<string | null>(null);

const save = async (): Promise<void> => {
  token.value = null;
  await run(async (bearer) => {
    if (!confirmado.value) {
      throw new Error("Confirme a operação.");
    }
    const result = await completeSetup(
      "/app/api/setup/rotacionar",
      { email: credenciais.value.email, senha: credenciais.value.senha },
      bearer,
    );
    if (result.token) {
      token.value = result.token;
      session.rememberIssued(result.token);
    }
  });
};
</script>

<template>
  <Page
    title="Rotacionar Bearer"
    lead="O Bearer atual vale até este POST concluir. Depois só o novo autentica esta persona."
    :error="error"
  >
    <div v-if="token" class="ok">
      <p>Novo Bearer (uma vez):</p>
      <pre class="code">{{ token }}</pre>
    </div>
    <form class="card" @submit.prevent="save">
      <CredentialFields v-model="credenciais" />
      <ConfirmField v-model="confirmado" />
      <button type="submit" :disabled="pending">Emitir novo Bearer</button>
    </form>
  </Page>
</template>
