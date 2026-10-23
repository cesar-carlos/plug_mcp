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
  <section aria-labelledby="oauth-connections-heading">
    <h3 id="oauth-connections-heading">Conexões OAuth da persona</h3>
    <p>
      Consulte os consentimentos e encerre uma conexão específica. Esta lista verifica somente o
      estado local; não testa o ChatGPT, o hub, o agente ou a consulta.
    </p>
    <p v-if="error" ref="errorSummary" tabindex="-1" role="alert" class="error">{{ error }}</p>
    <p v-if="message" role="status">{{ message }}</p>
    <button :disabled="busy || disabled || !!selected" @click="run(() => load())">
      Atualizar conexões OAuth
    </button>
    <p v-if="!loaded">Carregue a lista para conferir as conexões registradas.</p>
    <p v-else-if="!rows.length">
      Nenhuma conexão neste recorte. Isso não comprova ausência de atividade anterior.
    </p>
    <ul>
      <li v-for="row in rows" :key="row.id">
        <strong>{{ row.tokenName }}</strong> · {{ labels[row.state] }}
        <p>Cliente autorizado: {{ row.clientId }}</p>
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
          :disabled="busy || disabled || !!selected || !!row.revokedAt"
          @click="
            selected = row;
            confirmed = false;
          "
        >
          Revisar revogação {{ row.id }}
        </button>
      </li>
    </ul>
    <button v-if="cursor" :disabled="busy || disabled || !!selected" @click="run(() => load(true))">
      Mais conexões OAuth
    </button>
    <form v-if="selected" aria-label="Revogar conexão OAuth" @submit.prevent="revoke">
      <h4>Revogar somente esta conexão</h4>
      <p>{{ selected.clientId }} · token {{ selected.tokenName }} · {{ selected.id }}</p>
      <p>
        Access e refresh desta conexão deixarão de funcionar. Esta ação não revoga o token
        originador, outras conexões nem desfaz operações já enviadas.
      </p>
      <details>
        <summary>Consentimento exato</summary>
        <pre>{{ JSON.stringify(selected.permissions, null, 2) }}</pre>
      </details>
      <label
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
