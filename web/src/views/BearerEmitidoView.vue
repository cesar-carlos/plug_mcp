<script lang="ts">
export default { name: "BearerEmitidoView" };
</script>

<script setup lang="ts">
import { computed } from "vue";
import { useSessionStore } from "../stores/session";
import Page from "../components/Page.vue";

const session = useSessionStore();
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
  <Page class="public" title="Bearer emitido uma vez">
    <div class="card">
      <p v-if="!session.issuedToken">Nenhum Bearer nesta aba. Cadastre ou cole um token.</p>
      <template v-else>
        <p>Copie agora. O cofre guarda só o hash.</p>
        <p v-if="mesmaPersona">Este Bearer passou a ser o da aba.</p>
        <p v-else>Este Bearer é da persona nova. A aba continua na persona anterior.</p>
        <pre class="code">{{ session.issuedToken }}</pre>
        <pre class="code">{{ snippet }}</pre>
        <div class="row">
          <RouterLink v-if="mesmaPersona" to="/acesso">Abrir manutenção</RouterLink>
          <RouterLink v-else to="/acesso">Voltar à persona atual</RouterLink>
          <RouterLink to="/conectar">Nova conexão</RouterLink>
        </div>
      </template>
    </div>
  </Page>
</template>
