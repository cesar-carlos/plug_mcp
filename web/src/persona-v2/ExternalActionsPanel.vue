<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import ConsumerOperationPanel from "./ConsumerOperationPanel.vue";
import ExternalPreparationPanel from "./ExternalPreparationPanel.vue";
import type { ExternalContract } from "../../../src/domain/persona-v2/external-contract";
import type { ExternalReconciliation } from "../../../src/domain/persona-v2/external-reconciliation";
import type { OperationRetention } from "../../../src/domain/persona-v2/operation-retention";
import OperationRetentionNotice from "./OperationRetentionNotice.vue";
interface Action {
  operationId: string;
  fingerprint: string;
  state: string;
  expiresAt: string;
  requireHumanApproval: boolean;
  version: number;
  receipt: unknown;
  reconciliation?: ExternalReconciliation | null;
  retention?: OperationRetention;
}
interface Review extends Action {
  name: string;
  contract: ExternalContract | null;
  input: Record<string, string | number | boolean> | null;
  limits: { timeoutMs: number; maxBytes: number } | null;
}
const props = defineProps<{
  api: <T>(url: string, body?: unknown) => Promise<T>;
  base: string;
  disabled: boolean;
  personaId: string;
  bearer: string;
  call: <T>(tool: string, args: unknown) => Promise<T>;
  confirmDiscard: () => Promise<boolean>;
}>();
const emit = defineEmits<{
  lock: [value: boolean];
  dirty: [value: boolean];
  bearer: [value: string];
}>();
const consumerDirty = ref(false);
const preparationDirty = ref(false);
const rows = ref<Action[]>([]),
  selected = ref<Review>(),
  busy = ref(false),
  error = ref(""),
  message = ref(""),
  confirmed = ref(false),
  cursor = ref<string | null>(null),
  now = ref(Date.now());
watch([confirmed, consumerDirty, preparationDirty], () =>
  emit("dirty", confirmed.value || consumerDirty.value || preparationDirty.value),
);
const states: Record<string, string> = {
  preparada: "Preparada",
  aprovacao_pendente: "Aprovação pendente",
  aprovada: "Aprovada",
  executando: "Em execução",
  concluida: "Resposta recebida",
  resultado_desconhecido: "Resultado desconhecido",
  cancelada: "Cancelada antes do envio",
  expirada: "Expirada",
  recusada: "Recusada",
};
const mayApprove = computed(
  () =>
    selected.value?.state === "aprovacao_pendente" &&
    Date.parse(selected.value.expiresAt) > now.value &&
    confirmed.value,
);
let live = true,
  initialized = false;
const timer = window.setInterval(() => {
  now.value = Date.now();
}, 1000);
onBeforeUnmount(() => {
  live = false;
  selected.value = undefined;
  rows.value = [];
  window.clearInterval(timer);
  emit("lock", false);
  emit("dirty", false);
});
async function run(fn: () => Promise<void>) {
  if (busy.value || props.disabled) return;
  busy.value = true;
  emit("lock", true);
  error.value = "";
  message.value = "";
  try {
    await fn();
  } catch (e) {
    if (live) error.value = e instanceof Error ? e.message : "Ação indisponível.";
  } finally {
    busy.value = false;
    if (live) emit("lock", false);
  }
}
async function load(more = false) {
  const result = await props.api<{ operations: Action[]; nextCursor: string | null }>(
    `${props.base}/external-actions${more && cursor.value ? `?after=${encodeURIComponent(cursor.value)}` : ""}`,
  );
  if (!live) return;
  rows.value = more ? [...rows.value, ...result.operations] : result.operations;
  cursor.value = result.nextCursor;
}
async function review(id: string) {
  if (busy.value || props.disabled) return;
  if ((confirmed.value || consumerDirty.value) && !(await props.confirmDiscard())) return;
  if (!live || props.disabled) return;
  selected.value = undefined;
  confirmed.value = false;
  await run(async () => {
    const result = await props.api<Review>(`${props.base}/external-actions/${id}`);
    if (live) selected.value = result;
  });
}
async function approve() {
  if (!mayApprove.value || !selected.value) return;
  const reference = {
    operationId: selected.value.operationId,
    fingerprint: selected.value.fingerprint,
  };
  await run(async () => {
    await props.api(`${props.base}/external-actions/approve`, reference);
    if (!live) return;
    selected.value = undefined;
    confirmed.value = false;
    await load();
    message.value =
      "Conteúdo aprovado. A execução depende do consumidor e das permissões vigentes.";
  });
}
function initialize() {
  if (!props.disabled && !initialized && live) {
    initialized = true;
    void run(() => load());
  }
}
onMounted(initialize);
watch(() => props.disabled, initialize, { flush: "post" });
</script>
<template>
  <section aria-label="Ações externas da persona">
    <h2>Ações externas</h2>
    <ExternalPreparationPanel
      :persona-id="personaId"
      :bearer="bearer"
      :disabled="disabled || busy"
      :call="call"
      :confirm-discard="confirmDiscard"
      @bearer="emit('bearer', $event)"
      @lock="emit('lock', $event)"
      @dirty="preparationDirty = $event"
    />
    <p>
      Revise o conteúdo preparado antes de aprovar. O serviço externo recebe somente a operação
      publicada e autorizada.
    </p>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
    <p v-if="message" role="status" class="success">{{ message }}</p>
    <button class="secondary" :disabled="busy || disabled" @click="run(() => load())">
      Atualizar ações externas
    </button>
    <p v-if="!rows.length">Nenhuma ação externa registrada neste recorte.</p>
    <ul>
      <li v-for="row in rows" :key="row.operationId">
        <strong>{{ states[row.state] ?? row.state }}</strong>
        <p>
          Preparação {{ row.operationId }} · validade {{ new Date(row.expiresAt).toLocaleString() }}
        </p>
        <button class="secondary" :disabled="busy || disabled" @click="review(row.operationId)">
          Revisar ação {{ row.operationId }}
        </button>
      </li>
    </ul>
    <button
      v-if="cursor"
      class="secondary"
      :disabled="busy || disabled"
      @click="run(() => load(true))"
    >
      Carregar mais ações
    </button>
    <section v-if="selected" aria-label="Revisão de ação externa">
      <h3>{{ selected.name }} · {{ states[selected.state] ?? selected.state }}</h3>
      <template v-if="selected.contract">
        <p>{{ selected.contract.purpose }}</p>
        <p><strong>Efeitos:</strong> {{ selected.contract.effectDescription }}</p>
        <p><strong>Procedimento de conciliação:</strong> {{ selected.contract.reconciliation }}</p>
      </template>
      <OperationRetentionNotice :retention="selected.retention" />
      <p v-if="selected.state === 'resultado_desconhecido'" class="notice">
        A confirmação não é suficiente. Não repita esta ação; siga o procedimento de conciliação.
      </p>
      <p v-if="selected.state === 'concluida'">
        O serviço respondeu conforme o contrato. Isso não comprova todos os efeitos de negócio.
      </p>
      <p v-if="selected.reconciliation" role="status">
        Conciliação em {{ new Date(selected.reconciliation.observedAt).toLocaleString() }}:
        {{
          selected.reconciliation.status === "applied_verified"
            ? "evidência corresponde ao contrato treinado"
            : "evidência inconclusiva"
        }}. O comprovante técnico permanece preservado. Não autoriza reenviar a ação.
      </p>
      <dl v-if="selected.input">
        <template v-for="(value, key) in selected.input" :key="key"
          ><dt>{{ key }}</dt>
          <dd>{{ value }}</dd></template
        >
      </dl>
      <p v-if="selected.limits">
        Limite de resposta {{ selected.limits.maxBytes }} bytes · prazo
        {{ selected.limits.timeoutMs }} ms.
      </p>
      <details>
        <summary>Contrato e identificação</summary>
        <pre>{{
          JSON.stringify(
            {
              contrato: selected.contract,
              operacao: selected.operationId,
              fingerprint: selected.fingerprint,
              comprovante: selected.receipt,
              conciliacao: selected.reconciliation,
            },
            null,
            2,
          )
        }}</pre>
      </details>
      <label v-if="selected.state === 'aprovacao_pendente'"
        ><input v-model="confirmed" type="checkbox" :disabled="busy || disabled" />Revisei os
        parâmetros e os efeitos desta ação externa</label
      >
      <button
        v-if="selected.state === 'aprovacao_pendente'"
        :disabled="!mayApprove || busy || disabled"
        @click="approve"
      >
        Aprovar ação externa
      </button>
      <ConsumerOperationPanel
        :key="selected.operationId"
        kind="external"
        :persona-id="personaId"
        :reference="selected"
        :bearer="bearer"
        :call="call"
        :disabled="busy || disabled"
        @bearer="emit('bearer', $event)"
        @dirty="consumerDirty = $event"
        @lock="emit('lock', $event)"
      />
    </section>
  </section>
</template>
