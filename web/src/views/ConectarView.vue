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
    class="public"
    title="Conectar ao plug_server"
    lead="Informe o Client já ativo no hub. O MCP não cria User, Client nem Agent."
    :error="error"
  >
    <form class="card" @submit.prevent="submit">
      <CredentialFields v-model="credenciais" senha-label="Senha do hub" />
      <label>Agente (UUID) <input v-model="agentId" required /></label>
      <DialetoSelect v-model="dialeto" />
      <label
        >client_token <input v-model="clientToken" type="password" autocomplete="off" required
      /></label>
      <label>Nome amigável <input v-model="nomeAmigavel" /></label>
      <label
        ><input v-model="recuperar" type="checkbox" /> Recuperar acesso existente e substituir o
        Bearer</label
      >
      <label
        ><input v-model="confirmado" type="checkbox" required /> Confirmo esta operação no acesso
        informado</label
      >
      <div class="row">
        <button type="submit" :disabled="pending">Conectar</button>
        <RouterLink to="/conectar/colar">Já tenho um Bearer</RouterLink>
      </div>
    </form>
  </Page>
</template>
