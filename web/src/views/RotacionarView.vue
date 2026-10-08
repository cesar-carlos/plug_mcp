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
    lead="Emite outro token para esta mesma persona."
    :error="error"
  >
    <div v-if="token" class="ok">
      <p>Novo Bearer, mostrado uma vez:</p>
      <pre class="code">{{ token }}</pre>
    </div>
    <form class="card" @submit.prevent="save">
      <p class="callout warn">
        O Bearer atual vale até este envio concluir. Depois só o token novo autentica esta persona.
      </p>
      <fieldset class="section">
        <legend>Conta do hub</legend>
        <CredentialFields v-model="credenciais" senha-label="Senha do hub" />
      </fieldset>
      <ConfirmField v-model="confirmado" label="Confirmo invalidar o Bearer atual desta persona" />
      <div class="form-actions">
        <button type="submit" :disabled="pending">Emitir novo Bearer</button>
      </div>
    </form>
  </Page>
</template>
