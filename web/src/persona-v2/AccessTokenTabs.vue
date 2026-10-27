<script setup lang="ts">
import { ACCESS_TOKEN_TABS, type AccessTokenTab } from "./access-workspace";

defineProps<{
  selected: AccessTokenTab;
}>();
const emit = defineEmits<{
  select: [tab: AccessTokenTab];
}>();

const labels: Record<AccessTokenTab, string> = {
  list: "Tokens cadastrados",
  new: "Novo token",
  connect: "Usar e testar",
  chatgpt: "Conectar no ChatGPT",
  connections: "Conexões e delegação",
};
</script>
<template>
  <nav class="access-tabs" role="tablist" aria-label="Seções de tokens e conexões">
    <button
      v-for="tab in ACCESS_TOKEN_TABS"
      :key="tab"
      type="button"
      role="tab"
      class="secondary"
      :aria-selected="selected === tab"
      @click="emit('select', tab)"
    >
      {{ labels[tab] }}
    </button>
  </nav>
</template>
