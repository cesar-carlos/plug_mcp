<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { RouterLink } from "vue-router";
import { progressStateLabels, usePersonaProgress } from "./use-persona-progress";
const props = defineProps<{ api: <T>(url: string, body?: unknown) => Promise<T>; base: string }>();
const base = computed(() => props.base);
const { progress, loading, error, nextStep, load } = usePersonaProgress(props.api, base);
const errorSummary = ref<HTMLElement>();
watch(error, async (value) => {
  if (!value) return;
  await nextTick();
  errorSummary.value?.focus();
});
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
      <strong>{{ nextStep.label }} · {{ progressStateLabels[nextStep.state] }}</strong>
      <p>{{ nextStep.reason }}</p>
      <RouterLink :to="{ name: nextStep.area }">Continuar: {{ nextStep.action }}</RouterLink>
    </aside>
    <ol v-if="progress" class="onboarding">
      <li v-for="step in progress.steps" :key="step.id">
        <strong>{{ step.label }} · {{ progressStateLabels[step.state] }}</strong>
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
