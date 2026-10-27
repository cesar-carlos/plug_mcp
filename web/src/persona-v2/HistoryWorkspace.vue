<script setup lang="ts">
import HistoryPanel from "./HistoryPanel.vue";

defineProps<{
  personaId: string;
  api: <T>(url: string, body?: unknown) => Promise<T>;
  base: string;
}>();
</script>
<template>
  <HistoryPanel :key="personaId" :api="api" :base="base" />
</template>
