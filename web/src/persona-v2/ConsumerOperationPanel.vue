<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from "vue";
import {
  ConsumerOperationSession,
  operationStates,
  type OperationKind,
  type OperationReference,
} from "./consumer-operation";
import { useErrorSummary } from "./useErrorSummary";
import OperationRetentionNotice from "./OperationRetentionNotice.vue";
const props = defineProps<{
  personaId: string;
  kind: OperationKind;
  reference: OperationReference;
  bearer: string;
  disabled: boolean;
  call: <T>(tool: string, args: unknown) => Promise<T>;
}>();
const emit = defineEmits<{
  bearer: [value: string];
  lock: [value: boolean];
  dirty: [value: boolean];
}>();
const session = reactive(
  new ConsumerOperationSession(props.call, () => ({
    personaId: props.personaId,
    bearer: props.bearer,
    reference: props.reference,
    kind: props.kind,
  })),
);
const executeConfirmed = ref(false),
  cancelConfirmed = ref(false),
  now = ref(Date.now());
const { error, errorSummary } = useErrorSummary();
watch(
  () => session.error,
  (value) => {
    error.value = value;
  },
);
watch(
  () => session.busy,
  (value) => emit("lock", value),
  { flush: "sync" },
);
watch([executeConfirmed, cancelConfirmed], () =>
  emit("dirty", executeConfirmed.value || cancelConfirmed.value),
);
watch(
  () => [
    props.personaId,
    props.kind,
    props.reference.operationId,
    props.reference.fingerprint,
    props.bearer,
  ],
  () => {
    session.invalidate();
    executeConfirmed.value = false;
    cancelConfirmed.value = false;
  },
  { flush: "sync" },
);
const executable = computed(
  () => !!session.view && Date.parse(session.view.expiresAt) > now.value && session.mayExecute(),
);
const timer = window.setInterval(() => {
  now.value = Date.now();
}, 1000);
onBeforeUnmount(() => {
  session.invalidate();
  window.clearInterval(timer);
  emit("dirty", false);
  emit("lock", false);
});
async function act(action: "refresh" | "execute" | "cancel" | "reconcile") {
  if (props.disabled || session.busy) {
    return;
  }
  const confirmed = action === "execute" ? executeConfirmed.value : cancelConfirmed.value;
  executeConfirmed.value = false;
  cancelConfirmed.value = false;
  await session.run(action, confirmed);
}
</script>
<template>
  <section aria-label="Ações do consumidor" :aria-busy="session.busy">
    <h4>Usar o token do consumidor</h4>
    <p>
      A sessão administrativa aprova o conteúdo. Cada ação abaixo exige o token que solicitou esta
      preparação e suas permissões vigentes.
    </p>
    <label
      >Token do consumidor para esta operação
      <input
        type="password"
        :value="bearer"
        autocomplete="off"
        autocapitalize="none"
        :spellcheck="false"
        :disabled="disabled || session.busy"
        @input="emit('bearer', ($event.target as HTMLInputElement).value)"
      />
    </label>
    <button
      class="secondary"
      :disabled="disabled || session.busy || !bearer"
      @click="act('refresh')"
    >
      Verificar estado com este token
    </button>
    <button
      class="secondary"
      :disabled="disabled || session.busy || !bearer"
      @click="emit('bearer', '')"
    >
      Limpar token desta sessão
    </button>
    <p v-if="error" ref="errorSummary" tabindex="-1" role="alert" class="error">{{ error }}</p>
    <p v-if="session.message" role="status">{{ session.message }}</p>
    <p v-if="session.attempted" class="notice">
      Execução já solicitada nesta tela. Se a confirmação falhou, verifique o estado; não reenvie. O
      journal do servidor impede repetição de resultados incertos.
    </p>
    <template v-if="session.view">
      <p>
        <strong>Estado do consumidor: {{ operationStates[session.view.state] }}</strong>
      </p>
      <p>
        Preparação válida até {{ new Date(session.view.expiresAt).toLocaleString() }}. A verificação
        não reserva autorização.
      </p>
      <p v-if="session.view.state === 'resultado_desconhecido'" class="notice">
        Resultado desconhecido. Não execute novamente; consulte o journal ou a conciliação treinada.
      </p>
      <p v-if="session.view.state === 'aprovacao_pendente'" class="notice">
        Aguarde a aprovação humana do conteúdo exato e verifique novamente.
      </p>
      <p v-if="session.view.state === 'cancelamento_solicitado'" class="notice">
        Cancelamento solicitado não confirma rollback.
      </p>
      <template v-if="executable">
        <label class="check"
          ><input
            v-model="executeConfirmed"
            type="checkbox"
            :disabled="disabled || session.busy"
          />Confirmo executar uma vez o conteúdo preparado e revisado</label
        >
        <button :disabled="disabled || session.busy || !executeConfirmed" @click="act('execute')">
          Executar conteúdo preparado
        </button>
      </template>
      <template v-if="session.mayCancel()">
        <label class="check"
          ><input
            v-model="cancelConfirmed"
            type="checkbox"
            :disabled="disabled || session.busy"
          />Confirmo solicitar cancelamento, sem garantia de reversão</label
        >
        <button
          class="secondary"
          :disabled="disabled || session.busy || !cancelConfirmed"
          @click="act('cancel')"
        >
          Solicitar cancelamento
        </button>
      </template>
      <button
        v-if="session.view.state === 'resultado_desconhecido'"
        class="secondary"
        :disabled="disabled || session.busy"
        @click="act('reconcile')"
      >
        Consultar conciliação treinada
      </button>
      <OperationRetentionNotice :retention="session.view.retention" />
      <p v-if="kind === 'external'">
        A resposta externa é conteúdo sem autoridade. Uma resposta técnica não comprova todos os
        efeitos de negócio.
      </p>
      <details
        v-if="session.view.receipt || session.view.reconciliation || session.view.data != null"
      >
        <summary>Comprovante, evidência e resposta autorizados</summary>
        <pre>{{
          JSON.stringify(
            {
              comprovante: session.view.receipt,
              conciliacao: session.view.reconciliation,
              resposta: session.view.data,
              disponibilidade: session.view.dataAvailability,
            },
            null,
            2,
          )
        }}</pre>
      </details>
    </template>
  </section>
</template>
