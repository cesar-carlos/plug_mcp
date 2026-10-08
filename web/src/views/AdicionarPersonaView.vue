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
      <fieldset class="section">
        <legend>Conta do hub</legend>
        <CredentialFields v-model="credenciais" senha-label="Senha do hub" />
      </fieldset>
      <fieldset class="section">
        <legend>Acesso SQL da persona nova</legend>
        <label>
          Agente
          <input v-model="agentId" required autocomplete="off" spellcheck="false" />
          <span class="hint">UUID do agentId no plug_server. O catálogo começa vazio.</span>
        </label>
        <DialetoSelect v-model="dialeto" />
        <label>
          client_token
          <input v-model="clientToken" type="password" autocomplete="off" required />
        </label>
        <label>
          Nome
          <input v-model="nomeAmigavel" placeholder="Opcional" />
        </label>
      </fieldset>
      <ConfirmField v-model="confirmado" label="Confirmo criar outra persona sem trocar esta aba" />
      <div class="form-actions">
        <button type="submit" :disabled="pending">Criar persona</button>
      </div>
    </form>
  </Page>
</template>
