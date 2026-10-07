<script lang="ts">
export default { name: "AcessoView" };
</script>

<script setup lang="ts">
import { onMounted } from "vue";
import { useAction } from "../composables/useAction";
import { useSessionStore } from "../stores/session";
import Page from "../components/Page.vue";

const session = useSessionStore();
const { error, run } = useAction();

onMounted(() => {
  void run(async () => session.refreshAcesso());
});
</script>

<template>
  <Page title="Acesso desta persona" :error="error">
    <div v-if="session.acesso" class="card">
      <table>
        <tbody>
          <tr>
            <th>Nome</th>
            <td>{{ session.acesso.nomeAmigavel }}</td>
          </tr>
          <tr>
            <th>Agente</th>
            <td>{{ session.acesso.agentId }}</td>
          </tr>
          <tr>
            <th>Dialeto</th>
            <td>{{ session.acesso.dialeto }}</td>
          </tr>
          <tr>
            <th>Status</th>
            <td>{{ session.acesso.statusAcesso }}</td>
          </tr>
          <tr>
            <th>SQL</th>
            <td>{{ session.acesso.sqlAccessState }} ({{ session.acesso.sqlAccessSource }})</td>
          </tr>
          <tr>
            <th>client_token</th>
            <td>{{ session.acesso.clientTokenMasked }}</td>
          </tr>
          <tr>
            <th>Persona</th>
            <td>{{ session.acesso.nomePersona ?? "—" }}</td>
          </tr>
        </tbody>
      </table>
      <p>Este Bearer autentica só esta persona. Outro chapéu usa outro token.</p>
    </div>
  </Page>
</template>
