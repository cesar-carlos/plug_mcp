<script setup lang="ts">
import ExternalActionsPanel from "./ExternalActionsPanel.vue";
import ExternalTestsPanel from "./ExternalTestsPanel.vue";
import { lazyPanel } from "./lazy-panel";

const IntegrationManagementPanel = lazyPanel(() => import("./IntegrationManagementPanel.vue"));

defineProps<{
  personaId: string;
  integrationManagementKey: number;
  externalTestsKey: number;
  externalActionsKey: number;
  api: <T>(url: string, body?: unknown) => Promise<T>;
  base: string;
  disabled: boolean;
  bearer: string;
  call: <T>(tool: string, args: unknown) => Promise<T>;
  confirmDiscard: () => Promise<boolean>;
}>();
const emit = defineEmits<{
  managementDirty: [value: boolean];
  testsDirty: [value: boolean];
  actionsDirty: [value: boolean];
  bearer: [value: string];
  lock: [value: boolean];
}>();
</script>
<template>
  <section>
    <IntegrationManagementPanel
      :key="`${personaId}:${integrationManagementKey}`"
      :api="api"
      :base="base"
      :disabled="disabled"
      :confirm-discard="confirmDiscard"
      @dirty="emit('managementDirty', $event)"
      @lock="emit('lock', $event)"
    />
    <ExternalTestsPanel
      :key="`${personaId}:${externalTestsKey}`"
      :api="api"
      :base="base"
      :disabled="disabled"
      :confirm-discard="confirmDiscard"
      @dirty="emit('testsDirty', $event)"
      @lock="emit('lock', $event)"
    />
    <ExternalActionsPanel
      :key="`${personaId}:${externalActionsKey}`"
      :api="api"
      :base="base"
      :disabled="disabled"
      :persona-id="personaId"
      :bearer="bearer"
      :call="call"
      :confirm-discard="confirmDiscard"
      @bearer="emit('bearer', $event)"
      @dirty="emit('actionsDirty', $event)"
      @lock="emit('lock', $event)"
    />
    <p class="notice">
      Cadastro direto pelo responsável, suspensão e rotação ficam na gestão acima. Contratos, casos
      e publicação ficam em Treinamentos, incluindo descoberta MCP e importação OpenAPI como
      rascunho. Homologação de provedores reais continua pendente; o deploy permanece bloqueado.
    </p>
  </section>
</template>
