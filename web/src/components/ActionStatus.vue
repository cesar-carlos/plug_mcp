<script setup lang="ts">
defineProps<{ pending?: boolean; success?: boolean }>();
</script>
<template>
  <p v-if="pending" class="action-status" role="status">Processando…</p>
  <p v-else-if="success" class="action-status success-text" role="status">Operação concluída.</p>
</template>
