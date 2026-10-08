<script lang="ts">
export default { name: "ColarBearerView" };
</script>

<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { useAction } from "../composables/useAction";
import { useSessionStore } from "../stores/session";
import Page from "../components/Page.vue";

const router = useRouter();
const session = useSessionStore();
const { error, run, pending, success } = useAction();
const token = ref("");

const enter = async (): Promise<void> => {
  await run(async () => {
    session.setBearer(token.value.trim());
    try {
      await session.refreshAcesso();
    } catch (caught) {
      session.clear();
      throw caught;
    }
    await router.push({ name: "acesso" });
  });
};
</script>

<template>
  <Page
    class="public"
    title="Usar Token MCP"
    lead="O token fica só na memória desta aba. Recarregar a página pede o Token MCP de novo."
    :error="error"
    :pending="pending"
    :success="success"
  >
    <form class="card" @submit.prevent="enter">
      <label>Token MCP <input v-model="token" type="password" autocomplete="off" required /></label>
      <div class="row">
        <button type="submit">Entrar</button>
        <RouterLink to="/conectar">Cadastrar conexão</RouterLink>
      </div>
    </form>
  </Page>
</template>
