<script setup lang="ts">
import type { AttachmentDescriptor } from "../../../src/domain/persona-v2/attachments";
import FederationPanel from "./FederationPanel.vue";
import QueryRunnerPanel from "./QueryRunnerPanel.vue";
import type { Publication, QueryResult, Source } from "./model";
import type { ParameterMode } from "./query-parameters";

defineProps<{
  busy: boolean;
  publications: Record<string, Publication>;
  sources: Source[];
  active?: Publication;
  grantedQueries?: { id: string; name: string; publicationId: string; hash: string }[];
  queryPage: number;
  submittedFilters: Record<string, unknown>;
  result?: QueryResult;
  attachment?: AttachmentDescriptor;
  personaId: string;
  federationKey: number;
  disabled: boolean;
  confirmDiscard: () => Promise<boolean>;
  mcp: <T>(tool: string, args: unknown) => Promise<T>;
  activeArea: boolean;
}>();
const bearer = defineModel<string>("bearer", { required: true });
const querySkill = defineModel<string>("querySkill", { required: true });
const querySql = defineModel<string>("querySql", { required: true });
const queryValues = defineModel<Record<string, string>>("queryValues", { required: true });
const queryModes = defineModel<Record<string, ParameterMode>>("queryModes", { required: true });
const queryPageSize = defineModel<number>("queryPageSize", { required: true });
const emit = defineEmits<{
  inspect: [];
  query: [validation: boolean, page?: number];
  createAttachment: [format: "json" | "binary"];
  downloadAttachment: [];
  lock: [value: boolean];
  federationDirty: [value: boolean];
}>();
</script>
<template>
  <section>
    <QueryRunnerPanel
      v-model:bearer="bearer"
      v-model:query-skill="querySkill"
      v-model:query-sql="querySql"
      v-model:query-values="queryValues"
      v-model:query-modes="queryModes"
      v-model:query-page-size="queryPageSize"
      :busy="busy"
      :publications="publications"
      :sources="sources"
      :active="active"
      :granted-queries="grantedQueries"
      :query-page="queryPage"
      :submitted-filters="submittedFilters"
      :result="result"
      :attachment="attachment"
      @inspect="emit('inspect')"
      @query="(validation, page) => emit('query', validation, page)"
      @create-attachment="emit('createAttachment', $event)"
      @download-attachment="emit('downloadAttachment')"
    />
  </section>
  <FederationPanel
    v-if="activeArea"
    :key="`${personaId}:${federationKey}`"
    :persona-id="personaId"
    :bearer="bearer"
    :sources="sources"
    :disabled="disabled"
    :mcp="mcp"
    :confirm-discard="confirmDiscard"
    @lock="emit('lock', $event)"
    @dirty="emit('federationDirty', $event)"
  />
</template>
