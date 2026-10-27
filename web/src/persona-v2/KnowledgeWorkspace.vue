<script setup lang="ts">
import { RouterLink } from "vue-router";
import { lazyPanel } from "./lazy-panel";
import type { GrantPublication, Source } from "./model";

const KnowledgeExplorer = lazyPanel(() => import("./KnowledgeExplorer.vue"));
const KnowledgeFeedbackPanel = lazyPanel(() => import("./KnowledgeFeedbackPanel.vue"));
const SourceKnowledgeWorkspace = lazyPanel(() => import("./SourceKnowledgeWorkspace.vue"));

defineProps<{
  personaId: string;
  bearer: string;
  sourceKnowledgeKey: number;
  publications: Record<string, GrantPublication>;
  sources: Source[];
  api: <T>(url: string, body?: unknown) => Promise<T>;
  base: string;
  call: <T>(tool: string, args: unknown) => Promise<T>;
  disabled: boolean;
  confirmDiscard: () => Promise<boolean>;
}>();
const emit = defineEmits<{
  explorerDirty: [value: boolean];
  maintenanceDirty: [value: boolean];
  knowledgeDirty: [value: boolean];
  lock: [value: boolean];
}>();
</script>
<template>
  <section>
    <KnowledgeExplorer
      :key="`explore:${personaId}:${sourceKnowledgeKey}`"
      :persona-id="personaId"
      :bearer="bearer"
      :call="call"
      :disabled="disabled"
      :confirm-discard="confirmDiscard"
      @lock="emit('lock', $event)"
      @dirty="emit('explorerDirty', $event)"
    />
    <KnowledgeFeedbackPanel
      :key="`feedback:${personaId}:${sourceKnowledgeKey}`"
      :persona-base="base"
      :drafts="
        Object.entries(publications).map(([id, p]) => ({
          id,
          name: p.package.name,
          activePublicationId: p.id,
        }))
      "
      :api="api"
      :disabled="disabled"
      :confirm-discard="confirmDiscard"
      @dirty="emit('maintenanceDirty', $event)"
      @lock="emit('lock', $event)"
    />
    <SourceKnowledgeWorkspace
      :key="`knowledge:${personaId}:${sourceKnowledgeKey}`"
      :sources="sources"
      :persona-base="base"
      :api="api"
      :disabled="disabled"
      :confirm-discard="confirmDiscard"
      @dirty="emit('knowledgeDirty', $event)"
      @lock="emit('lock', $event)"
    />
    <RouterLink :to="{ name: 'catalog' }">Abrir catálogo compartilhado</RouterLink>
  </section>
</template>
