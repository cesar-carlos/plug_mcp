<script setup lang="ts">
import { lazyPanel } from "./lazy-panel";
import ListSearch from "./ListSearch.vue";
import SourceLifecycle from "./SourceLifecycle.vue";
import SourceRegistrationForm from "./SourceRegistrationForm.vue";
import SourceSettings from "./SourceSettings.vue";
import { sourceLinkStatus } from "./console-status";
import type { Source } from "./model";
import type { SourceForm } from "./source-form";

const SourceKnowledgeWorkspace = lazyPanel(() => import("./SourceKnowledgeWorkspace.vue"));

defineProps<{
  sources: Source[];
  matchingSources: Source[];
  highlightedSourceId: string;
  busy: boolean;
  invalidField: (field: string) => boolean;
  replacementName?: string;
  sourceFormVersions: Record<string, number>;
  personaId: string;
  sourceKnowledgeKey: number;
  api: <T>(url: string, body?: unknown) => Promise<T>;
  base: string;
  confirmDiscard: () => Promise<boolean>;
  active: boolean;
}>();
const sourceSearch = defineModel<string>("sourceSearch", { required: true });
const sourceForm = defineModel<SourceForm>("form", { required: true });
const replacementConfirmed = defineModel<boolean>("replacementConfirmed", { required: true });
const sourceOpen = defineModel<boolean>("sourceOpen", { required: true });
const emit = defineEmits<{
  save: [sourceId: string, input: unknown];
  rotate: [sourceId: string, input: unknown];
  dirty: [sourceId: string, value: boolean];
  lifecycleDirty: [sourceId: string, value: boolean];
  reload: [sourceId: string];
  state: [sourceId: string, active: boolean, input: unknown];
  replace: [source: Source];
  submit: [];
  cancel: [];
  knowledgeDirty: [value: boolean];
  lock: [value: boolean];
}>();
</script>
<template>
  <section>
    <ListSearch
      v-if="sources.length"
      v-model="sourceSearch"
      label="Buscar bases"
      :matches="matchingSources.length"
      :total="sources.length"
    />
    <p v-if="!sources.length && !busy" class="notice">
      Nenhuma base conectada. Abra “Adicionar uma base” para cadastrar a conexão e conferir sua
      identidade.
    </p>
    <h2>Bases conectadas</h2>
    <p v-if="!sources.length">Cadastre a primeira base desta persona.</p>
    <ul>
      <li
        v-for="s in sources"
        v-show="matchingSources.includes(s)"
        :id="`source-${s.id}`"
        :key="s.id"
        :class="{ notice: highlightedSourceId === s.id }"
        tabindex="-1"
      >
        <strong>{{ s.name }}</strong> — {{ s.purpose }} ({{ s.dialect }})
        <p>
          {{ sourceLinkStatus(s) }}
          · Banco: {{ s.database }}
          <span v-if="s.identityVerifiedAt"
            >· Identidade conferida em {{ new Date(s.identityVerifiedAt).toLocaleString() }}</span
          >
        </p>
        <SourceSettings
          :key="`${s.id}:${sourceFormVersions[s.id] ?? 0}`"
          :source="s"
          :busy="busy"
          :base="base"
          :api="api"
          @lock="emit('lock', $event)"
          @save="emit('save', s.id, $event)"
          @rotate="emit('rotate', s.id, $event)"
          @dirty="emit('dirty', s.id, $event)"
          @reload="emit('reload', s.id)"
        />
        <SourceLifecycle
          :key="`lifecycle:${s.id}:${sourceFormVersions[s.id] ?? 0}`"
          :source="s"
          :busy="busy"
          :base="base"
          :api="api"
          @lock="emit('lock', $event)"
          @state="(active, input) => emit('state', s.id, active, input)"
          @replace="emit('replace', s)"
          @reload="emit('reload', s.id)"
          @dirty="emit('lifecycleDirty', s.id, $event)"
        />
      </li>
    </ul>
    <details :open="sourceOpen" @toggle="sourceOpen = ($event.target as HTMLDetailsElement).open">
      <summary>
        {{ replacementName ? `Substituir base ${replacementName}` : "Adicionar uma base" }}
      </summary>
      <SourceRegistrationForm
        v-model:form="sourceForm"
        v-model:replacement-confirmed="replacementConfirmed"
        :busy="busy"
        :invalid-field="invalidField"
        :replacement-name="replacementName"
        @submit="emit('submit')"
        @cancel="emit('cancel')"
      />
    </details>
    <SourceKnowledgeWorkspace
      v-if="sources.length && active"
      :key="`source-erp:${personaId}:${sourceKnowledgeKey}`"
      :sources="sources"
      :initial-source-id="highlightedSourceId"
      :persona-base="base"
      :api="api"
      :disabled="busy"
      :confirm-discard="confirmDiscard"
      registration
      @dirty="emit('knowledgeDirty', $event)"
      @lock="emit('lock', $event)"
    />
  </section>
</template>
