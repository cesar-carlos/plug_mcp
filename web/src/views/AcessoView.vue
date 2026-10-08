<script lang="ts">
export default { name: "AcessoView" };
</script>

<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useAction } from "../composables/useAction";
import { statusLabel, toneForStatus } from "../presentation";
import { useSessionStore } from "../stores/session";
import Page from "../components/Page.vue";
import StatusPill from "../components/StatusPill.vue";

const session = useSessionStore();
const { error, run, pending, success } = useAction();

const sqlResumo = computed(() => {
  const acesso = session.acesso;
  if (!acesso) {
    return { label: "—", tone: "neutral" as const, hint: "" };
  }
  if (acesso.sqlAccessState === "unknown" && acesso.sqlAccessSource === "vault") {
    return {
      label: "não consultado",
      tone: "warn" as const,
      hint: "O cofre guarda o client_token, mas não pergunta ao hub se ele ainda está ativo. Verificar hub lê a policy agora.",
    };
  }
  const state = acesso.sqlAccessState ?? "—";
  const source = acesso.sqlAccessSource ? ` (${acesso.sqlAccessSource})` : "";
  return { label: `${state}${source}`, tone: toneForStatus(state), hint: "" };
});

onMounted(() => {
  void run(async () => session.refreshAcesso(), { feedback: false });
});
</script>

<template>
  <Page
    title="Acesso desta persona"
    lead="Este Token MCP autentica só esta persona. Outra persona usa outro token."
    :error="error"
    :pending="pending"
    :success="success"
  >
    <div v-if="session.acesso" class="card">
      <div class="row">
        <StatusPill
          :label="statusLabel(session.acesso.statusAcesso)"
          :tone="toneForStatus(session.acesso.statusAcesso)"
        />
        <StatusPill :label="session.acesso.dialeto" />
        <StatusPill :label="sqlResumo.label" :tone="sqlResumo.tone" />
      </div>
      <dl class="facts">
        <div>
          <dt>Nome</dt>
          <dd>{{ session.acesso.nomeAmigavel }}</dd>
        </div>
        <div>
          <dt>Persona</dt>
          <dd>{{ session.acesso.nomePersona ?? "Sem nome de persona" }}</dd>
        </div>
        <div class="wide">
          <dt>Agente</dt>
          <dd class="mono">{{ session.acesso.agentId }}</dd>
        </div>
        <div class="wide">
          <dt>Token SQL</dt>
          <dd class="mono">{{ session.acesso.clientTokenMasked }}</dd>
        </div>
      </dl>
      <p v-if="sqlResumo.hint" class="callout warn">{{ sqlResumo.hint }}</p>
    </div>
  </Page>
</template>
