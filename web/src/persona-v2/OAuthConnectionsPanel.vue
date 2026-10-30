<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from "vue";
import type {
  PersonaOAuthConnection,
  PersonaOAuthConnectionPage,
} from "../../../src/domain/persona-v2/oauth-connections";
const props = defineProps<{
  api: <T>(url: string, body?: unknown) => Promise<T>;
  base: string;
  disabled: boolean;
  refresh: number;
}>();
const emit = defineEmits<{ dirty: [value: boolean]; lock: [value: boolean] }>();
const rows = ref<PersonaOAuthConnection[]>([]),
  selected = ref<PersonaOAuthConnection>(),
  cursor = ref<string | null>(null);
const busy = ref(false),
  error = ref(""),
  message = ref(""),
  confirmed = ref(false),
  loaded = ref(false);
const errorSummary = ref<HTMLElement>();
const labels = {
  vigente_localmente: "Consentimento vigente no MCP",
  revogada: "Revogada",
  expirada: "Expirada",
  bloqueada: "Bloqueada pelo token ou pela persona",
};
function clientLabel(clientId: string) {
  try {
    const url = new URL(clientId);
    if (["https:", "http:"].includes(url.protocol)) return url.hostname;
  } catch {
    /* Opaque identifiers remain available in technical details. */
  }
  return "Cliente conectado";
}
let live = true;
watch(selected, (value) => emit("dirty", !!value));
watch(
  () => props.refresh,
  () => {
    confirmed.value = false;
    if (!selected.value) {
      rows.value = [];
      loaded.value = false;
    }
    message.value =
      "Token alterado. Encerre a revisão pendente e atualize as conexões para conferir o estado vigente.";
  },
);
onBeforeUnmount(() => {
  live = false;
  rows.value = [];
  selected.value = undefined;
  emit("dirty", false);
  emit("lock", false);
});
async function run(action: () => Promise<void>) {
  if (busy.value || props.disabled) return;
  busy.value = true;
  emit("lock", true);
  error.value = "";
  message.value = "";
  try {
    await action();
  } catch (cause) {
    if (live) {
      error.value = cause instanceof Error ? cause.message : "Conexões indisponíveis.";
      await nextTick();
      errorSummary.value?.focus();
    }
  } finally {
    if (live) {
      busy.value = false;
      emit("lock", false);
    }
  }
}
async function load(more = false) {
  const result = await props.api<PersonaOAuthConnectionPage>(
    `${props.base}/oauth-connections${more && cursor.value ? `?after=${encodeURIComponent(cursor.value)}` : ""}`,
  );
  if (!live) return;
  rows.value = more ? [...rows.value, ...result.items] : [...result.items];
  cursor.value = result.nextCursor;
  loaded.value = true;
}
async function revoke() {
  if (!confirmed.value || !selected.value) return;
  const snapshot = selected.value;
  await run(async () => {
    const receipt = await props.api<{ id: string; status: "revoked"; revokedAt: string }>(
      `${props.base}/oauth-connections/${snapshot.id}/revogar`,
      { fingerprint: snapshot.fingerprint, confirmed: true },
    );
    if (!live) return;
    selected.value = undefined;
    confirmed.value = false;
    await load();
    message.value = `Conexão ${receipt.id} revogada. Token originador e outras conexões foram preservados.`;
  });
}
</script>
<template>
  <section
    id="access-connections"
    role="tabpanel"
    aria-labelledby="oauth-connections-heading"
    :aria-busy="busy"
    class="access-card"
    tabindex="-1"
  >
    <h3 id="oauth-connections-heading">Conexões OAuth da persona</h3>
    <p>
      Consulte os consentimentos e encerre uma conexão específica. Esta lista verifica somente o
      estado local; não testa o ChatGPT, o hub, o agente ou a consulta.
    </p>
    <p v-if="error" ref="errorSummary" tabindex="-1" role="alert" class="error">{{ error }}</p>
    <p v-if="message" role="status">{{ message }}</p>
    <button class="secondary" :disabled="busy || disabled || !!selected" @click="run(() => load())">
      Atualizar conexões OAuth
    </button>
    <p v-if="busy" role="status">Conferindo conexões…</p>
    <p v-else-if="!loaded">Carregue a lista para conferir as conexões registradas.</p>
    <p v-else-if="!rows.length">
      Nenhuma conexão neste recorte. Isso não comprova ausência de atividade anterior.
    </p>
    <ul class="access-records">
      <li v-for="row in rows" :key="row.id">
        <div class="access-record-heading">
          <strong>{{ clientLabel(row.clientId) }}</strong
          ><span
            class="access-status"
            :class="{ 'access-status-muted': row.state !== 'vigente_localmente' }"
            >{{ labels[row.state] }}</span
          >
        </div>
        <p>
          Token associado: <strong>{{ row.tokenName }}</strong>
        </p>
        <details>
          <summary>Identificação da conexão</summary>
          <p>Cliente autorizado: {{ row.clientId }}</p>
          <p>ID da conexão: {{ row.id }}</p>
        </details>
        <details v-if="row.health">
          <summary>Saúde da conexão</summary>
          <p>
            {{
              {
                available: "Consentimento local disponível",
                grant_revoked: "Conexão revogada",
                grant_expired: "Consentimento expirado",
                token_revoked: "Token originador revogado",
                token_expired: "Token originador expirado",
                authorization_changed: "Permissões alteradas; conecte novamente",
                persona_inactive: "Persona suspensa",
              }[row.health.reason]
            }}
          </p>
          <p>
            Última renovação:
            {{
              row.health.lastRefreshedAt
                ? new Date(row.health.lastRefreshedAt).toLocaleString()
                : "Não registrada"
            }}
          </p>
          <p>
            Último access token válido até:
            {{
              row.health.accessExpiresAt
                ? new Date(row.health.accessExpiresAt).toLocaleString()
                : "Não registrado"
            }}
          </p>
          <p>
            Token originador:
            {{
              row.health.tokenExpiresAt
                ? new Date(row.health.tokenExpiresAt).toLocaleString()
                : "Sem data de expiração"
            }}
          </p>
          <p>
            O access token dura até 15 minutos e pode ser renovado pelo cliente OAuth enquanto o
            consentimento estiver válido. Estes dados não confirmam atividade no ChatGPT.
          </p>
        </details>
        <p>
          Consentimento: {{ row.permissions.sourceIds.length }} base(s),
          {{ row.permissions.skills.length }} skill(s),
          {{ row.permissions.externalOperationIds.length }} operação(ões) externa(s).
        </p>
        <p>
          Consentimento criado:
          {{ row.createdAt ? new Date(row.createdAt).toLocaleString() : "Data não registrada" }} ·
          Válida até {{ new Date(row.expiresAt).toLocaleString() }}
        </p>
        <button
          class="secondary"
          :aria-label="`Revisar revogação ${row.id}`"
          :disabled="busy || disabled || !!selected || !!row.revokedAt"
          @click="
            selected = row;
            confirmed = false;
          "
        >
          Revisar revogação
        </button>
      </li>
    </ul>
    <button v-if="cursor" :disabled="busy || disabled || !!selected" @click="run(() => load(true))">
      Mais conexões OAuth
    </button>
    <form
      v-if="selected"
      aria-label="Revogar conexão OAuth"
      class="access-editor"
      @submit.prevent="revoke"
    >
      <h4>Revogar somente esta conexão</h4>
      <p>{{ clientLabel(selected.clientId) }} · token {{ selected.tokenName }}</p>
      <details>
        <summary>Identificação da conexão selecionada</summary>
        <p>{{ selected.clientId }}</p>
        <p>{{ selected.id }}</p>
      </details>
      <p>
        Access e refresh desta conexão deixarão de funcionar. Esta ação não revoga o token
        originador, outras conexões nem desfaz operações já enviadas.
      </p>
      <details>
        <summary>Consentimento exato</summary>
        <pre>{{ JSON.stringify(selected.permissions, null, 2) }}</pre>
      </details>
      <label class="check"
        ><input v-model="confirmed" type="checkbox" :disabled="busy || disabled" />Revisei esta
        conexão e confirmo sua revogação.</label
      >
      <button :disabled="busy || disabled || !confirmed" class="danger">
        Confirmar revogação da conexão
      </button>
      <button
        type="button"
        :disabled="busy || disabled"
        @click="
          selected = undefined;
          confirmed = false;
        "
      >
        Continuar com a conexão
      </button>
    </form>
  </section>
</template>
