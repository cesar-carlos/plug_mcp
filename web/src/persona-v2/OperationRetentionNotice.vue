<script setup lang="ts">
import type { OperationRetention } from "../../../src/domain/persona-v2/operation-retention";
defineProps<{ retention?: OperationRetention }>();
</script>
<template>
  <p v-if="retention?.payloadPurgedAt" role="status">
    Os dados operacionais foram removidos pelo prazo de retenção em
    {{ new Date(retention.payloadPurgedAt).toLocaleString() }}.
  </p>
  <p v-if="retention?.receiptPurgedAt" role="status">
    O comprovante foi removido pelo prazo de retenção em
    {{ new Date(retention.receiptPurgedAt).toLocaleString() }}. Estado e identificação permanecem
    registrados. Isso não autoriza reenviar a operação.
  </p>
</template>
