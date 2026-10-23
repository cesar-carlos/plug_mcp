<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import type {
  NotificationConfiguration,
  NotificationDelivery,
  NotificationEvent,
} from "../../../src/domain/persona-v2/notifications";
const props = defineProps<{
  api: <T>(url: string, body?: unknown) => Promise<T>;
  base: string;
  disabled: boolean;
}>();
const emit = defineEmits<{ dirty: [value: boolean]; lock: [value: boolean] }>();
const configuration = ref<NotificationConfiguration>({
  version: 0,
  active: false,
  configured: false,
  events: [],
});
const form = reactive({
  active: false,
  destination: "",
  secret: "",
  events: [] as NotificationEvent[],
  confirmed: false,
});
const rows = ref<NotificationDelivery[]>([]),
  cursor = ref<string | null>(null),
  busy = ref(false),
  error = ref(""),
  message = ref("");
const snapshot = () => JSON.stringify(form),
  saved = ref(snapshot());
const dirty = computed(() => snapshot() !== saved.value);
watch(dirty, (value) => emit("dirty", value));
const labels: Record<NotificationEvent, string> = {
  "knowledge.review_due": "Revisões privadas vencidas",
  "sql.operation_state": "Estados de lançamentos SQL",
  "external.action_state": "Estados de ações externas",
};
let live = true;
let stopInitialLoad: (() => void) | undefined;
const errorSummary = ref<HTMLElement>();
onBeforeUnmount(() => {
  live = false;
  stopInitialLoad?.();
  form.secret = "";
  rows.value = [];
  emit("dirty", false);
  emit("lock", false);
});
async function run(action: () => Promise<void>) {
  if (busy.value || props.disabled) return;
  busy.value = true;
  error.value = "";
  message.value = "";
  emit("lock", true);
  try {
    await action();
  } catch (cause) {
    if (live) {
      error.value = cause instanceof Error ? cause.message : "Notificações indisponíveis.";
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
async function deliveries(more = false) {
  const result = await props.api<{ items: NotificationDelivery[]; nextCursor: string | null }>(
    `${props.base}/notifications/deliveries${more && cursor.value ? `?after=${encodeURIComponent(cursor.value)}` : ""}`,
  );
  if (!live) return;
  rows.value = more ? [...rows.value, ...result.items] : result.items;
  cursor.value = result.nextCursor;
}
async function load() {
  const result = await props.api<NotificationConfiguration>(`${props.base}/notifications`);
  if (!live) return;
  configuration.value = result;
  Object.assign(form, {
    active: result.active,
    destination: "",
    secret: "",
    confirmed: false,
    events: [...result.events],
  });
  saved.value = snapshot();
  await deliveries();
}
async function save() {
  await run(async () => {
    try {
      await props.api(`${props.base}/notifications`, {
        expectedVersion: configuration.value.version,
        ...form,
        ...(form.active ? {} : { destination: undefined, secret: undefined }),
      });
      if (!live) return;
      await load();
      message.value = "Configuração salva. Nenhuma notificação de teste foi enviada.";
    } finally {
      form.secret = "";
    }
  });
}
onMounted(async () => {
  await nextTick();
  if (!live) return;
  let started = false;
  stopInitialLoad = watch(
    () => props.disabled,
    (blocked) => {
      if (!blocked && !started) {
        started = true;
        void run(load);
      }
    },
    { immediate: true },
  );
});
</script>
<template>
  <section aria-labelledby="notifications-heading">
    <h2 id="notifications-heading">Notificações externas</h2>
    <p>
      Envie somente identificadores, prazos e estados desta persona. SQL, parâmetros, resultados e
      segredos não fazem parte dos avisos. Notificações de catálogos compartilhados permanecem
      internas.
    </p>
    <p role="status">
      {{ configuration.active ? "Envio habilitado" : "Envio desativado" }} · Revisão
      {{ configuration.version }}
    </p>
    <p v-if="error" ref="errorSummary" role="alert" tabindex="-1" class="error">{{ error }}</p>
    <p v-if="message" role="status">{{ message }}</p>
    <form aria-label="Configurar notificações externas" @submit.prevent="save">
      <fieldset :disabled="busy || disabled">
        <legend>Destino autorizado pelo responsável</legend>
        <label><input v-model="form.active" type="checkbox" />Habilitar envio</label>
        <template v-if="form.active">
          <label
            >Endereço HTTPS público<input
              v-model="form.destination"
              type="url"
              required
              maxlength="2048"
              autocomplete="off"
              placeholder="https://notificacoes.exemplo.com/eventos"
          /></label>
          <label
            >Segredo de assinatura<input
              v-model="form.secret"
              type="password"
              required
              minlength="32"
              maxlength="256"
              pattern="[A-Za-z0-9_-]+"
              autocomplete="new-password"
          /></label>
          <p>
            Informe um segredo novo, compartilhado com o destinatário. Não será mostrado novamente.
            Para alterar ou reativar, preencha endereço e segredo novamente.
          </p>
        </template>
        <fieldset>
          <legend>Eventos permitidos</legend>
          <label v-for="(label, event) in labels" :key="event"
            ><input v-model="form.events" type="checkbox" :value="event" />{{ label }}</label
          >
        </fieldset>
        <label
          ><input v-model="form.confirmed" type="checkbox" required />Confirmo o destino e os
          metadados enviados. Alterar esta configuração cancela entregas pendentes da revisão
          anterior.</label
        >
        <button :disabled="!form.confirmed || !form.events.length">Salvar notificações</button>
      </fieldset>
    </form>
    <p>
      O destinatário deve verificar a assinatura e eliminar duplicatas pelo ID do evento. Falhas têm
      tentativas limitadas; este serviço não repete lançamentos ou ações de negócio.
    </p>
    <button :disabled="busy || disabled || dirty" @click="run(load)">
      Recarregar configuração e entregas
    </button>
    <h3>Entregas registradas</h3>
    <p v-if="!rows.length">
      Nenhuma entrega registrada. Isso não comprova ausência de atividade anterior.
    </p>
    <ul>
      <li v-for="row in rows" :key="row.id">
        {{ labels[row.event] }} ·
        {{
          row.state === "entregue"
            ? "Confirmada pelo destinatário"
            : row.state === "dead_letter"
              ? "Encerrada sem confirmação"
              : "Pendente"
        }}
        · {{ row.attempts }} tentativa(s) · {{ new Date(row.createdAt).toLocaleString() }}
        <details>
          <summary>Identificação da entrega</summary>
          <code>{{ row.id }}</code>
          <p v-if="row.failure">{{ row.failure }}</p>
        </details>
      </li>
    </ul>
    <button v-if="cursor" :disabled="busy || disabled" @click="run(() => deliveries(true))">
      Mais entregas
    </button>
  </section>
</template>
