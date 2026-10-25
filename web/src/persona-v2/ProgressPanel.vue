<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import type { PersonaProgress } from "../../../src/domain/persona-v2/console";
import { useErrorSummary } from "./useErrorSummary";
const props = defineProps<{ api: <T>(url: string, body?: unknown) => Promise<T>; base: string }>();
const progress = ref<PersonaProgress>(),
  loading = ref(false);
const { error, errorSummary } = useErrorSummary();
let live = true;
onBeforeUnmount(() => {
  live = false;
});
const nextStep = computed(() =>
  progress.value?.steps.find(
    (step) => step.state !== "concluido" && step.state !== "nao_aplicavel",
  ),
);
const states = {
  pendente: "Pendente",
  disponivel: "Disponível",
  concluido: "Concluído",
  bloqueado: "Bloqueado",
  nao_aplicavel: "Não aplicável",
};
async function load() {
  if (loading.value) return;
  loading.value = true;
  error.value = "";
  try {
    const result = await props.api<PersonaProgress>(`${props.base}/progresso`);
    if (live) progress.value = result;
  } catch (cause) {
    if (!live) return;
    progress.value = undefined;
    error.value = cause instanceof Error ? cause.message : "Não foi possível conferir o roteiro.";
  } finally {
    loading.value = false;
  }
}
onMounted(load);
</script>
<template>
  <section aria-label="Roteiro da persona" :aria-busy="loading">
    <h3>Próximos passos</h3>
    <p>Conectar fonte → preparar skill → publicar → conceder acesso por token → consultar.</p>
    <p>
      O roteiro distingue registros anteriores de acesso disponível agora. Cada execução confere
      novamente as permissões.
    </p>
    <button type="button" class="secondary" :disabled="loading" @click="load">
      Atualizar roteiro
    </button>
    <p v-if="error" ref="errorSummary" role="alert" tabindex="-1" class="error">{{ error }}</p>
    <p v-if="loading" role="status">Conferindo os próximos passos…</p>
    <aside v-if="nextStep" class="next-step" aria-label="Próximo passo recomendado">
      <strong>{{ nextStep.label }} · {{ states[nextStep.state] }}</strong>
      <p>{{ nextStep.reason }}</p>
      <RouterLink :to="{ name: nextStep.area }">Continuar: {{ nextStep.action }}</RouterLink>
    </aside>
    <ol v-if="progress" class="onboarding">
      <li v-for="step in progress.steps" :key="step.id">
        <strong>{{ step.label }} · {{ states[step.state] }}</strong>
        <p>{{ step.reason }}</p>
        <RouterLink :to="{ name: step.area }">{{ step.action }}</RouterLink>
      </li>
    </ol>
    <p v-if="progress">
      Conferido em
      {{ new Date(progress.checkedAt).toLocaleString("pt-BR", { timeZoneName: "short" }) }}.
      Disponibilidade remota ainda precisa de verificação.
    </p>
  </section>
</template>
