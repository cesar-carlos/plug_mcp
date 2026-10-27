<script setup lang="ts">
import { lazyPanel } from "./lazy-panel";
import type { ImportedDraftReference } from "./model";

const SharedKnowledgePanel = lazyPanel(() => import("./SharedKnowledgePanel.vue"));

defineProps<{
  knowledgeKey: number;
  api: <T>(url: string, body?: unknown) => Promise<T>;
  confirmDiscard: () => Promise<boolean>;
  disabled: boolean;
}>();
const emit = defineEmits<{
  dirty: [value: boolean];
  lock: [value: boolean];
  openDraft: [value: ImportedDraftReference];
}>();
</script>
<template>
  <SharedKnowledgePanel
    :key="knowledgeKey"
    :api="api"
    :confirm-discard="confirmDiscard"
    :disabled="disabled"
    @dirty="emit('dirty', $event)"
    @lock="emit('lock', $event)"
    @open-draft="emit('openDraft', $event)"
  />
</template>
