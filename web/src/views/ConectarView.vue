<script lang="ts">
export default { name: "ConectarView" };
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

const router = useRouter();
const session = useSessionStore();
const { pending, error, run } = useAction();
const credenciais = ref({ email: "", senha: "" });
const agentId = ref("");
const dialeto = ref("mssql");
const clientToken = ref("");
const nomeAmigavel = ref("");
const recuperar = ref(false);
const confirmado = ref(false);

const submit = async (): Promise<void> => {
  await run(async () => {
    const completed = await completeSetup("/app/api/setup/registrar", {
      email: credenciais.value.email,
      senha: credenciais.value.senha,
      agentId: agentId.value,
      dialeto: dialeto.value,
      clientToken: clientToken.value,
      nomeAmigavel: nomeAmigavel.value,
      ...(recuperar.value ? { recuperar: "sim" } : {}),
    });
    if (!completed.token) {
      throw new Error("O servidor não devolveu o Bearer.");
    }
    session.rememberIssued(completed.token);
    await router.push({ name: "bearer" });
  });
};
</script>

<template>
  <Page
    class="public connect"
    title="Conectar ao plug_server"
    lead="Informe o Client já ativo no hub. O MCP não cria User, Client nem Agent."
    :error="error"
  >
    <form class="card connect-card" @submit.prevent="submit">
      <fieldset class="section">
        <legend>Conta do hub</legend>
        <CredentialFields v-model="credenciais" senha-label="Senha do hub" />
      </fieldset>
      <fieldset class="section">
        <legend>Acesso SQL</legend>
        <label>
          Agente
          <input
            v-model="agentId"
            required
            autocomplete="off"
            spellcheck="false"
            placeholder="UUID do agentId"
          />
          <span class="hint">O mesmo agentId já cadastrado no plug_server.</span>
        </label>
        <DialetoSelect v-model="dialeto" />
        <label>
          client_token
          <input v-model="clientToken" type="password" autocomplete="off" required />
          <span class="hint">Token SQL deste acesso. Ele não volta a aparecer.</span>
        </label>
        <label>
          Nome amigável
          <input v-model="nomeAmigavel" autocomplete="off" placeholder="Opcional" />
          <span class="hint">Só para reconhecer a persona nesta lista.</span>
        </label>
      </fieldset>
      <fieldset class="section">
        <legend>Confirmação</legend>
        <label class="choice">
          <input v-model="recuperar" type="checkbox" />
          <span>Recuperar acesso existente e substituir o Bearer</span>
        </label>
        <label class="choice">
          <input v-model="confirmado" type="checkbox" required />
          <span>Confirmo esta operação no acesso informado</span>
        </label>
      </fieldset>
      <div class="connect-actions">
        <button type="submit" :disabled="pending">
          {{ pending ? "Conectando…" : "Conectar" }}
        </button>
        <RouterLink class="ghost-link" to="/conectar/colar">Já tenho um Bearer</RouterLink>
      </div>
    </form>
  </Page>
</template>
