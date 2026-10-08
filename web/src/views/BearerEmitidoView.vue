<script lang="ts">
export default { name: "BearerEmitidoView" };
</script>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import { useSessionStore } from "../stores/session";
import Page from "../components/Page.vue";

const session = useSessionStore();
const copied = ref(false);
const copyError = ref("");
onBeforeUnmount(() => session.clearIssued());
const copiar = async (value: string): Promise<void> => {
  copied.value = false;
  copyError.value = "";
  try {
    await navigator.clipboard.writeText(value);
    copied.value = true;
  } catch {
    copyError.value = "Não foi possível copiar. Selecione o texto e copie manualmente.";
  }
};
const mesmaPersona = computed(
  () => Boolean(session.bearer) && session.bearer === session.issuedToken,
);
const pageOrigin = (): string => {
  const scope = globalThis as typeof globalThis & { location?: { origin: string } };
  return scope.location?.origin ?? "";
};
const snippet = computed(
  () => `{
  "url": "${pageOrigin()}/mcp",
  "headers": {
    "Authorization": "Bearer ${session.issuedToken ?? ""}"
  }
}`,
);
</script>

<template>
  <Page class="public" title="Token MCP emitido uma vez">
    <div class="card">
      <p v-if="!session.issuedToken">Nenhum Token MCP nesta aba. Cadastre ou cole um token.</p>
      <template v-else>
        <p>Copie agora. O cofre guarda só o hash.</p>
        <p v-if="mesmaPersona">Este Token MCP passou a ser o da aba.</p>
        <p v-else>Este Token MCP é da persona nova. A aba continua na persona anterior.</p>
        <pre class="code">{{ session.issuedToken }}</pre>
        <pre class="code">{{ snippet }}</pre>
        <p v-if="copied" class="success-text" role="status">Copiado.</p>
        <p v-if="copyError" role="alert">{{ copyError }}</p>
        <div class="row">
          <button type="button" @click="copiar(session.issuedToken || '')">Copiar token MCP</button>
          <button class="secondary" type="button" @click="copiar(snippet)">
            Copiar configuração
          </button>
          <RouterLink v-if="mesmaPersona" to="/acesso">Abrir manutenção</RouterLink>
          <RouterLink v-else to="/acesso">Voltar à persona atual</RouterLink>
          <RouterLink to="/conectar">Nova conexão</RouterLink>
        </div>
      </template>
    </div>
  </Page>
</template>
