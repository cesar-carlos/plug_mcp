<script lang="ts">
export default { name: "ErrorBanner" };
</script>

<script setup lang="ts">
import { ConsoleApiError } from "../api";

defineProps<{ error: unknown }>();

const text = (error: unknown): { title: string; hint: string } => {
  if (error instanceof ConsoleApiError) {
    return { title: `${error.code}: ${error.message}`, hint: error.hint };
  }
  if (error instanceof Error) {
    return { title: error.message, hint: "" };
  }
  return { title: "Falha inesperada.", hint: "" };
};
</script>

<template>
  <div v-if="error" class="error" role="alert">
    <strong>{{ text(error).title }}</strong>
    <div v-if="text(error).hint">{{ text(error).hint }}</div>
    <details v-if="error instanceof ConsoleApiError" class="raw">
      <summary>Detalhes técnicos</summary>
      <p>
        Origem: {{ error.source || "console" }}<br />Próxima ação: {{ error.nextAction || "—" }}
      </p>
    </details>
  </div>
</template>
