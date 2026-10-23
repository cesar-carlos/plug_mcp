<script setup lang="ts">
import { ref, computed, onBeforeUnmount, watch } from "vue";
import { useErrorSummary } from "./useErrorSummary";
import type { ReviewCalendar } from "../../../src/domain/persona-v2/knowledge-maintenance";
import type { ReviewTask } from "../../../src/domain/ports/review-worker.port";
const props = defineProps<{
  root: string;
  api: <T>(url: string, body?: unknown) => Promise<T>;
  disabled: boolean;
  confirmDiscard: () => Promise<boolean>;
}>();
const emit = defineEmits<{ dirty: [boolean]; lock: [boolean] }>();
interface Calendar {
  notifications: { items: ReviewTask[]; nextCursor: string | null };
  checkedAt: string;
  state: string;
  dueAt: string | null;
  version: number;
  task: string;
  history: ReviewCalendar[];
  nextVersion: number | null;
}
const calendar = ref<Calendar>(),
  due = ref(""),
  reason = ref(""),
  decision = ref("configurar"),
  busy = ref(false),
  message = ref("");
const { error, errorSummary } = useErrorSummary();
let live = true;
const dirty = computed(() => !!due.value || !!reason.value);
watch(dirty, (v) => emit("dirty", v), { immediate: true });
onBeforeUnmount(() => {
  live = false;
  emit("dirty", false);
});
async function run(action: () => Promise<void>) {
  if (busy.value || props.disabled) {
    return;
  }
  busy.value = true;
  emit("lock", true);
  error.value = "";
  message.value = "";
  try {
    await action();
  } catch (e) {
    if (live) {
      error.value = e instanceof Error ? e.message : "Revisão indisponível.";
    }
  } finally {
    busy.value = false;
    emit("lock", false);
  }
}
async function load(append = false) {
  if (!append && dirty.value && !(await props.confirmDiscard())) {
    return;
  }
  await run(async () => {
    const data = await props.api<Calendar>(
      props.root +
        (append && calendar.value?.nextVersion
          ? `?beforeVersion=${calendar.value.nextVersion}`
          : ""),
    );
    if (!live) {
      return;
    }
    calendar.value =
      append && calendar.value
        ? {
            ...calendar.value,
            history: [...calendar.value.history, ...data.history],
            nextVersion: data.nextVersion,
          }
        : data;
    if (!append) {
      due.value = "";
      reason.value = "";
      decision.value = "configurar";
    }
  });
}
async function save() {
  if (!calendar.value) {
    return;
  }
  await run(async () => {
    const data = await props.api<Calendar>(props.root, {
      expectedVersion: calendar.value!.version,
      dueAt: new Date(due.value).toISOString(),
      decision: decision.value,
      reason: reason.value,
    });
    if (!live) {
      return;
    }
    calendar.value = data;
    due.value = "";
    reason.value = "";
    message.value = "Prazo registrado. Publicação e permissões permanecem sem alteração.";
  });
}
async function readNotification(id: string) {
  if (dirty.value && !(await props.confirmDiscard())) {
    return;
  }
  await run(async () => {
    const data = await props.api<Calendar>(`${props.root}/notificacoes/${id}/lida`, {});
    if (live) {
      calendar.value = data;
      due.value = "";
      reason.value = "";
      decision.value = "configurar";
    }
  });
}
</script>
<template>
  <section aria-label="Revisão temporal do conhecimento">
    <h4>Revisão temporal</h4>
    <p>Informe o horário local. O registro conserva a data correspondente em UTC.</p>
    <p>O curador escolhe o prazo. Vencimento gera aviso e tarefa, sem suspender a execução.</p>
    <p v-if="error" ref="errorSummary" class="error" role="alert" tabindex="-1">{{ error }}</p>
    <p v-if="message" role="status">{{ message }}</p>
    <fieldset :disabled="disabled || busy">
      <button type="button" @click="load()">Carregar calendário de revisão</button>
      <template v-if="calendar"
        ><p>
          Verificado em {{ new Date(calendar.checkedAt).toLocaleString() }}. Recarregue para
          atualizar o aviso.
        </p>
        <p role="status">
          {{
            calendar.state === "nao_configurada"
              ? "Revisão não configurada"
              : calendar.state === "vencida"
                ? "Revisão vencida"
                : "Revisão em dia"
          }}<span v-if="calendar.dueAt"> · {{ new Date(calendar.dueAt).toLocaleString() }}</span>
        </p>
        <p v-if="calendar.task" class="notice">Tarefa: {{ calendar.task }}</p>
        <section aria-label="Notificações de revisão">
          <h4>Notificações do worker</h4>
          <p v-if="!calendar.notifications.items.length">
            Nenhuma notificação registrada para esta versão.
          </p>
          <ul>
            <li v-for="n in calendar.notifications.items" :key="n.id">
              Revisão prevista para {{ new Date(n.dueAt).toLocaleString() }} ·
              {{ n.closedAt ? "Resolvida ou obsoleta" : "Pendente" }} ·
              {{ n.readAt ? "Lida" : "Não lida"
              }}<button v-if="!n.readAt" type="button" @click="readNotification(n.id)">
                Marcar notificação como lida
              </button>
            </li>
          </ul>
          <p v-if="calendar.notifications.nextCursor">
            Mostrando as vinte notificações mais recentes deste recorte.
          </p>
          <p>Marcar como lida não conclui a revisão.</p>
        </section>
        <form aria-label="Definir revisão temporal" @submit.prevent="save">
          <label>Próxima revisão<input v-model="due" type="datetime-local" required /></label
          ><label
            >Decisão<select v-model="decision">
              <option value="configurar">Configurar ou ajustar prazo</option>
              <option value="revisado" :disabled="calendar.version === 0">Revisão realizada</option>
            </select></label
          ><label
            >Justificativa da revisão<textarea v-model="reason" maxlength="2000" required /></label
          ><button>Registrar prazo explícito</button>
        </form>
        <details>
          <summary>Histórico de revisões</summary>
          <ol>
            <li v-for="h in calendar.history" :key="h.version">
              {{ h.version }} · {{ new Date(h.decidedAt).toLocaleString() }} ·
              {{ h.decision === "revisado" ? "Revisão realizada" : "Prazo configurado" }} · próxima
              revisão {{ new Date(h.dueAt).toLocaleString() }} · {{ h.reason }}
              <details>
                <summary>Autoria</summary>
                {{ h.ownerId }}
              </details>
            </li>
          </ol>
          <button v-if="calendar.nextVersion" type="button" @click="load(true)">
            Carregar revisões anteriores
          </button>
        </details></template
      >
    </fieldset>
  </section>
</template>
