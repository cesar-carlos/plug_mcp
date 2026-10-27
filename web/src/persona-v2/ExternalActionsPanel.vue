<script setup lang="ts">
import ConsumerOperationPanel from "./ConsumerOperationPanel.vue";
import ExternalPreparationPanel from "./ExternalPreparationPanel.vue";
import OperationRetentionNotice from "./OperationRetentionNotice.vue";
import {
  externalActionStateLabel,
  externalReconciliationLabel,
  useExternalActionReview,
} from "./use-external-action-review";

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
const {
  consumerDirty,
  preparationDirty,
  rows,
  selected,
  busy,
  error,
  message,
  confirmed,
  cursor,
  mayApprove,
  run,
  load,
  review,
  approve,
} = useExternalActionReview(props, emit);
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
        <strong>{{ externalActionStateLabel(row.state) }}</strong>
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
      <h3>{{ selected.name }} · {{ externalActionStateLabel(selected.state) }}</h3>
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
        {{ externalReconciliationLabel(selected.reconciliation.status) }}. O comprovante técnico
        permanece preservado. Não autoriza reenviar a ação.
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
