<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, computed, watch } from "vue";
import { administrativeOptions } from "./administrative-options";
import { useErrorSummary } from "./useErrorSummary";
const props = defineProps<{
  personaId: string;
  api: <T>(url: string, body?: unknown) => Promise<T>;
}>();
const state = ref<{
  version: number;
  active: boolean;
  expiresAt: string | null;
  administrative: string[];
}>();
const selected = ref<string[]>([]);
const emit = defineEmits<{ dirty: [value: boolean]; lock: [value: boolean] }>();
const dirty = computed(
  () =>
    JSON.stringify([...selected.value].sort()) !==
    JSON.stringify([...(state.value?.administrative ?? [])].sort()),
);
watch(dirty, (value) => emit("dirty", value));
const busy = ref(false),
  message = ref(""),
  verified = ref(false);
const { error, errorSummary } = useErrorSummary();
let active = true;
onBeforeUnmount(() => {
  active = false;
  state.value = undefined;
  emit("dirty", false);
  emit("lock", false);
});
const path = `/api/admin/personas/${encodeURIComponent(props.personaId)}/delegation`;
async function load() {
  if (busy.value) return;
  if (
    dirty.value &&
    !window.confirm("Descartar as permissões em edição e conferir o estado atual da delegação?")
  )
    return;
  busy.value = true;
  verified.value = false;
  error.value = "";
  message.value = "";
  emit("lock", true);
  try {
    const v = await props.api<NonNullable<typeof state.value>>(path);
    if (active) {
      state.value = v;
      selected.value = [...v.administrative];
      verified.value = true;
      message.value = "Estado local conferido. A autoridade será revalidada no hub a cada uso.";
    }
  } catch {
    if (active)
      error.value = "Não foi possível verificar a delegação. Confira o estado antes de alterar.";
  } finally {
    if (active) {
      busy.value = false;
      emit("lock", false);
    }
  }
}
onMounted(load);
async function change(action: "create" | "revoke") {
  if (busy.value || !state.value || !verified.value) return;
  if (
    !window.confirm(
      action === "revoke"
        ? "Revogar a delegação e bloquear os setups administrativos anteriores?"
        : "Criar delegação por até 30 dias? A anterior será revogada e seus setups deixarão de valer.",
    )
  )
    return;
  busy.value = true;
  error.value = "";
  message.value = "";
  emit("lock", true);
  try {
    const v = await props.api<NonNullable<typeof state.value>>(`${path}/${action}`, {
      expectedVersion: state.value.version,
      ...(action === "create" ? { administrative: selected.value } : {}),
    });
    if (active) {
      state.value = v;
      selected.value = [...v.administrative];
      message.value =
        action === "create"
          ? "Delegação renovada. Revise novamente a conexão para conceder administração."
          : "Delegação revogada. Os setups anteriores não podem ser concluídos.";
    }
  } catch {
    if (active) {
      verified.value = false;
      error.value =
        "Não foi possível confirmar a alteração. Confira o estado antes de uma nova ação; a solicitação não será repetida.";
    }
  } finally {
    if (active) {
      busy.value = false;
      emit("lock", false);
    }
  }
}
</script>
<template>
  <section aria-label="Delegação administrativa" :aria-busy="busy">
    <h3>Delegação do responsável</h3>
    <p>
      Permite confirmar sua identidade ativa no hub sem guardar senha ou JWT. Expira em até 30 dias.
      Não concede permissões ao token nem substitui aprovação humana.
    </p>
    <p v-if="state">
      {{ state.active ? "Configurada localmente" : "Indisponível"
      }}<template v-if="state.expiresAt"> · Prazo: {{ state.expiresAt }}</template>
    </p>
    <p>A identidade ativa será conferida no hub a cada uso. Este estado não reserva autorização.</p>
    <p v-if="error" ref="errorSummary" role="alert" tabindex="-1">{{ error }}</p>
    <p v-if="state && !verified">Estado precisa ser conferido antes de alterar a delegação.</p>
    <button type="button" :disabled="busy" @click="load">Conferir estado da delegação</button>
    <fieldset :disabled="busy || !state || !verified">
      <legend>Permissões que poderão ser delegadas</legend>
      <label v-for="option in administrativeOptions" :key="option.id">
        <input v-model="selected" type="checkbox" :value="option.id" />{{ option.label }}
      </label>
    </fieldset>
    <p>
      Ao criar ou renovar, a delegação anterior é revogada. Setups antigos deixam de valer.
      Credenciais de bases continuam exigindo sua autenticação no navegador.
    </p>
    <button
      type="button"
      :disabled="busy || !state || !verified || !selected.length"
      @click="change('create')"
    >
      {{ state?.version ? "Renovar delegação por 30 dias" : "Criar delegação por 30 dias" }}
    </button>
    <button
      v-if="state?.active"
      type="button"
      class="danger"
      :disabled="busy || !verified"
      @click="change('revoke')"
    >
      Revogar delegação
    </button>
    <p role="status">{{ message }}</p>
  </section>
</template>
