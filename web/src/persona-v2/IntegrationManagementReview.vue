<script setup lang="ts">
import type { IntegrationReview } from "../../../src/domain/persona-v2/integration-management";
import type { IntegrationManagementAction } from "./integration-management";

defineProps<{
  review: IntegrationReview;
}>();
const emit = defineEmits<{ begin: [Exclude<IntegrationManagementAction, "criar">] }>();
</script>
<template>
  <p>
    Destino fixo: {{ review.connection.destination }} · credencial v{{
      review.connection.version
    }}
    · revisão de gestão {{ review.connection.managementVersion }}
  </p>
  <p>
    Operações habilitadas: {{ review.activeOperations }} · preparações, execuções ou resultados
    desconhecidos: {{ review.pendingOperations }}. Verifique os comprovantes; cancelamento e
    conciliação são separados.
  </p>
  <ul>
    <li v-for="publication in review.publications" :key="publication.publicationId">
      {{ publication.name }} · revisão {{ publication.revision }} ·
      {{ publication.suspended ? "publicação suspensa" : "publicação registrada" }}. Será mantida no
      histórico.
    </li>
  </ul>
  <button v-if="!review.connection.suspendedAt" type="button" @click="emit('begin', 'suspender')">
    Revisar suspensão da integração
  </button>
  <button v-else type="button" @click="emit('begin', 'recuperar')">
    Revisar recuperação da integração
  </button>
  <button type="button" @click="emit('begin', 'rotacionar')">Revisar rotação de credenciais</button>
</template>
