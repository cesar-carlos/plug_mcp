<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import SqlPreparationPanel from "./SqlPreparationPanel.vue";
import ConsumerOperationPanel from "./ConsumerOperationPanel.vue";
import type {
  OperationState,
  OperationReceipt,
  OperationReconciliation,
  SqlOperationCommand,
} from "../../../src/domain/persona-v2/operation";
import type { Source } from "./model";
import type { OperationRetention } from "../../../src/domain/persona-v2/operation-retention";
import OperationRetentionNotice from "./OperationRetentionNotice.vue";
interface Operation {
  operationId: string;
  publicationId: string;
  sourceId: string;
  fingerprint: string;
  state: OperationState;
  expiresAt: string;
  version: number;
  requireHumanApproval: boolean;
  receipt: OperationReceipt | null;
  reconciliation: OperationReconciliation | null;
  retention?: OperationRetention;
}
const props = defineProps<{
  api: <T>(url: string, body?: unknown) => Promise<T>;
  base: string;
  sources: Source[];
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
const rows = ref<Operation[]>([]),
  cursor = ref<string | null>(null);
const selected = ref<Operation & { command: SqlOperationCommand | null }>();
const busy = ref(false),
  error = ref(""),
  message = ref(""),
  confirmed = ref(false);
const now = ref(Date.now()),
  filter = ref("");
watch([confirmed, consumerDirty, preparationDirty], () =>
  emit("dirty", confirmed.value || consumerDirty.value || preparationDirty.value),
);
const states: Record<OperationState, string> = {
  preparada: "Preparada",
  aprovacao_pendente: "Aprovação pendente",
  aprovada: "Aprovada",
  executando: "Em execução",
  concluida: "Concluída",
  recusada: "Recusada",
  expirada: "Expirada",
  rollback_confirmado: "Rollback confirmado",
  cancelamento_solicitado: "Cancelamento solicitado",
  cancelada: "Cancelada",
  resultado_desconhecido: "Resultado desconhecido",
};
const visibleRows = computed(() =>
  rows.value.filter((row) => !filter.value || row.state === filter.value),
);
const mayApprove = computed(
  () =>
    !!selected.value?.command &&
    selected.value.state === "aprovacao_pendente" &&
    Date.parse(selected.value.expiresAt) > now.value &&
    confirmed.value,
);
let live = true;
const timer = window.setInterval(() => {
  now.value = Date.now();
}, 1000);
onBeforeUnmount(() => {
  live = false;
  selected.value = undefined;
  window.clearInterval(timer);
  emit("lock", false);
  emit("dirty", false);
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
    if (live) error.value = cause instanceof Error ? cause.message : "Operação indisponível.";
  } finally {
    busy.value = false;
    emit("lock", false);
  }
}
async function load(more = false) {
  const result = await props.api<{ operations: Operation[]; nextCursor: string | null }>(
    `${props.base}/operations${more && cursor.value ? `?after=${encodeURIComponent(cursor.value)}` : ""}`,
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
    const result = await props.api<Operation & { command: SqlOperationCommand | null }>(
      `${props.base}/operations/${id}`,
    );
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
    const result = await props.api<Operation>(`${props.base}/operations/approve`, reference);
    if (!live) return;
    selected.value = undefined;
    confirmed.value = false;
    await load();
    message.value = `Operação ${result.operationId} aprovada. A execução continua dependendo do token solicitante e das permissões vigentes.`;
  });
}
onMounted(() => {
  void run(() => load());
});
</script>
<template>
  <SqlPreparationPanel
    :persona-id="personaId"
    :bearer="bearer"
    :disabled="disabled || busy"
    :call="call"
    :confirm-discard="confirmDiscard"
    @bearer="emit('bearer', $event)"
    @lock="emit('lock', $event)"
    @dirty="preparationDirty = $event"
  />
  <section aria-label="Operações da persona">
    <h2>Operações SQL</h2>
    <p>
      Revise preparações solicitadas pelos clientes e acompanhe os estados registrados. Aprovar
      autoriza somente o conteúdo apresentado.
    </p>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
    <p v-if="message" role="status" class="success">{{ message }}</p>
    <button class="secondary" :disabled="busy || disabled" @click="run(() => load())">
      Atualizar operações
    </button>
    <label
      >Filtrar operações carregadas<select v-model="filter">
        <option value="">Todos os estados</option>
        <option v-for="(label, state) in states" :key="state" :value="state">{{ label }}</option>
      </select></label
    >
    <p v-if="!visibleRows.length">Nenhuma operação neste recorte.</p>
    <ul class="operation-list">
      <li v-for="row in visibleRows" :key="row.operationId">
        <strong>{{ states[row.state] }}</strong> ·
        {{ sources.find((source) => source.id === row.sourceId)?.name ?? "Fonte indisponível" }}
        <p>
          Preparação: {{ row.operationId }} · validade:
          {{ new Date(row.expiresAt).toLocaleString() }}
        </p>
        <button class="secondary" :disabled="busy || disabled" @click="review(row.operationId)">
          Revisar {{ row.operationId }}
        </button>
      </li>
    </ul>
    <button
      v-if="cursor"
      class="secondary"
      :disabled="busy || disabled"
      @click="run(() => load(true))"
    >
      Carregar mais operações
    </button>
    <section v-if="selected" aria-label="Revisão da operação">
      <h3>{{ states[selected.state] }}</h3>
      <p>
        Fonte:
        {{ sources.find((source) => source.id === selected?.sourceId)?.name ?? "Indisponível" }} ·
        versão {{ selected.version }}
      </p>
      <p v-if="selected.state === 'resultado_desconhecido'" class="notice">
        Não reenvie esta operação. Conciliação de negócio não substitui comprovante do agente nem
        prova rollback.
      </p>
      <p v-if="selected.state === 'cancelamento_solicitado'" class="notice">
        O pedido de cancelamento não confirma rollback.
      </p>
      <template v-if="selected.command">
        <p>
          Limite direto: {{ selected.command.maxAffectedRows }} linhas. Triggers e cascatas podem
          ter efeitos indiretos.
        </p>
        <ol>
          <li v-for="step in selected.command.steps" :key="step.id">
            <h4>{{ step.id }} · {{ step.effect }}</h4>
            <pre class="sql">{{ step.sql }}</pre>
            <details>
              <summary>Parâmetros e limites desta etapa</summary>
              <pre>{{
                JSON.stringify(
                  {
                    parametros: step.params,
                    linhasAfetadas: step.affectedRows,
                    linhasEsperadas: step.expectedRows,
                    saidas: step.outputs,
                  },
                  null,
                  2,
                )
              }}</pre>
            </details>
          </li>
        </ol>
      </template>
      <p v-else>O payload operacional não está mais disponível para revisão.</p>
      <OperationRetentionNotice :retention="selected.retention" />
      <details>
        <summary>Identificação e comprovante</summary>
        <pre>{{
          JSON.stringify(
            {
              operacao: selected.operationId,
              publicacao: selected.publicationId,
              fingerprint: selected.fingerprint,
              comprovante: selected.receipt,
              conciliacao: selected.reconciliation,
            },
            null,
            2,
          )
        }}</pre>
      </details>
      <form
        v-if="selected.state === 'aprovacao_pendente'"
        aria-label="Aprovar operação"
        @submit.prevent="approve"
      >
        <p v-if="Date.parse(selected.expiresAt) <= now" class="notice">
          A preparação expirou. Solicite uma nova preparação ao cliente.
        </p>
        <label class="check"
          ><input
            v-model="confirmed"
            type="checkbox"
            :disabled="busy || disabled || !selected.command"
          />Revisei as etapas e os parâmetros deste conteúdo exato.</label
        >
        <button :disabled="busy || disabled || !mayApprove">Aprovar conteúdo preparado</button>
      </form>
      <ConsumerOperationPanel
        :key="selected.operationId"
        kind="sql"
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
    <p class="notice">
      Novas preparações são solicitadas pelo cliente com a skill publicada. Nesta tela, selecione
      uma preparação e use o token solicitante para acompanhar ou agir sobre o conteúdo exato.
    </p>
  </section>
</template>
