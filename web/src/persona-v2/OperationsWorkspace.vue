<script setup lang="ts">
import NotificationsPanel from "./NotificationsPanel.vue";
import OperationsPanel from "./OperationsPanel.vue";
import type { Source } from "./model";

defineProps<{
  personaId: string;
  operationActionsKey: number;
  notificationsKey: number;
  api: <T>(url: string, body?: unknown) => Promise<T>;
  base: string;
  sources: Source[];
  disabled: boolean;
  bearer: string;
  call: <T>(tool: string, args: unknown) => Promise<T>;
  confirmDiscard: () => Promise<boolean>;
}>();
const emit = defineEmits<{
  bearer: [value: string];
  actionsDirty: [value: boolean];
  notificationsDirty: [value: boolean];
  lock: [value: boolean];
}>();
</script>
<template>
  <OperationsPanel
    :key="`${personaId}:${operationActionsKey}`"
    :api="api"
    :base="base"
    :sources="sources"
    :disabled="disabled"
    :persona-id="personaId"
    :bearer="bearer"
    :call="call"
    :confirm-discard="confirmDiscard"
    @bearer="emit('bearer', $event)"
    @dirty="emit('actionsDirty', $event)"
    @lock="emit('lock', $event)"
  />
  <NotificationsPanel
    :key="`${personaId}-${notificationsKey}`"
    :api="api"
    :base="base"
    :disabled="disabled"
    @dirty="emit('notificationsDirty', $event)"
    @lock="emit('lock', $event)"
  />
</template>
