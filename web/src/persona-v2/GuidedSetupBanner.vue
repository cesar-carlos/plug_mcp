<script setup lang="ts">
import { RouterLink } from "vue-router";
import type { PersonaProgress, ProgressStep } from "../../../src/domain/persona-v2/console";
import { progressStateLabels } from "./use-persona-progress";
const props = defineProps<{
  open: boolean;
  loading: boolean;
  error: string;
  progress?: PersonaProgress;
  nextStep?: ProgressStep;
  pendingCount: number;
}>();
const emit = defineEmits<{ "update:open": [value: boolean]; reload: [] }>();
function toggle(): void {
  emit("update:open", !props.open);
}
</script>
<template>
  <section aria-label="Guia passo a passo" class="guided-setup" :aria-busy="loading">
    <div class="guided-setup-heading">
      <h3>Guia passo a passo</h3>
      <button type="button" class="secondary" :aria-expanded="open" @click="toggle">
        {{ open ? "Ocultar guia" : "Mostrar guia" }}
      </button>
    </div>
    <template v-if="open">
      <p class="field-help">
        Conectar fonte → preparar skill → publicar → conceder acesso por token → consultar. O guia
        só orienta a ordem; cada passo confere o estado atual no servidor, sem conceder acesso.
      </p>
      <p v-if="error" role="alert" class="error">{{ error }}</p>
      <p v-else-if="loading && !progress" role="status">Conferindo os próximos passos…</p>
      <template v-else-if="nextStep">
        <aside class="next-step" aria-label="Próximo passo recomendado">
          <strong>{{ nextStep.label }} · {{ progressStateLabels[nextStep.state] }}</strong>
          <p>{{ nextStep.reason }}</p>
          <RouterLink :to="{ name: nextStep.area }">Continuar: {{ nextStep.action }}</RouterLink>
        </aside>
        <p v-if="pendingCount > 1" class="field-help">
          Mais {{ pendingCount - 1 }} passo(s) pendente(s). Veja o roteiro completo em
          <RouterLink :to="{ name: 'overview' }">Visão geral</RouterLink>.
        </p>
      </template>
      <p v-else-if="progress">
        Nenhum passo pendente no roteiro conferido às
        {{ new Date(progress.checkedAt).toLocaleTimeString("pt-BR") }}. Disponibilidade remota ainda
        precisa de verificação.
      </p>
      <button type="button" class="secondary" :disabled="loading" @click="emit('reload')">
        Atualizar guia
      </button>
    </template>
  </section>
</template>
