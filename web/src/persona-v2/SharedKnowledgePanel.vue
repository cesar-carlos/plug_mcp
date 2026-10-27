<script setup lang="ts">
import CatalogMembersForm from "./CatalogMembersForm.vue";
import CatalogPatternEditor from "./CatalogPatternEditor.vue";
import CatalogVersionHistory from "./CatalogVersionHistory.vue";
import KnowledgeCurationPanel from "./KnowledgeCurationPanel.vue";
import KnowledgeLibraryPanel from "./KnowledgeLibraryPanel.vue";
import { catalogRoleLabels } from "./catalog-labels";
import { useCatalogPanel } from "./use-catalog-panel";
import type { ImportedDraftReference } from "./model";

const props = defineProps<{
  api: <T>(url: string, body?: unknown) => Promise<T>;
  disabled: boolean;
  confirmDiscard: () => Promise<boolean>;
}>();
const emit = defineEmits<{
  dirty: [value: boolean];
  lock: [value: boolean];
  openDraft: [value: ImportedDraftReference];
}>();
const {
  catalogs,
  catalogId,
  catalogName,
  patterns,
  publications,
  busy,
  error,
  message,
  patternId,
  slug,
  name,
  content,
  reviewDate,
  preview,
  confirmed,
  libraryDirty,
  libraryKey,
  curationDirty,
  curationKey,
  clientId,
  role,
  members,
  versions,
  historyPatternId,
  nextCursor,
  beforeId,
  afterId,
  comparison,
  catalog,
  mayEdit,
  mayPublish,
  dirty,
  catalogPath,
  run,
  refresh,
  chooseCatalog,
  createCatalog,
  edit,
  importedDdl,
  curationUpdated,
  newPattern,
  importFile,
  save,
  prepare,
  publish,
  setMember,
  history,
  compare,
  suspend,
  onReviewDirty,
} = useCatalogPanel(props, emit);
</script>

<template>
  <details>
    <summary>Conhecimento compartilhado</summary>
    <section aria-label="Conhecimento compartilhado">
      <h2>Catálogos de estrutura</h2>
      <p>
        Compartilhe padrões e exemplos revisados entre responsáveis autorizados. A associação
        executável às bases ainda está em desenvolvimento.
      </p>
      <p v-if="error" role="alert">{{ error }}</p>
      <p v-if="message" role="status">{{ message }}</p>
      <fieldset :disabled="busy || disabled">
        <button type="button" @click="run(refresh)">Carregar catálogos</button>
        <label
          >Catálogo<select :value="catalogId" @change="chooseCatalog">
            <option value="">Selecione</option>
            <option v-for="c in catalogs" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select></label
        >
        <form aria-label="Criar catálogo" @submit.prevent="createCatalog">
          <label>Nome do catálogo<input v-model="catalogName" maxlength="200" required /></label>
          <button>Criar catálogo privado</button>
        </form>
        <template v-if="catalog">
          <p>Seu papel: {{ catalogRoleLabels[catalog.role] }}.</p>
          <ul>
            <li v-for="p in patterns" :key="p.id">
              <button type="button" @click="edit(p)">
                {{ p.name }} · revisão {{ p.revision }}
              </button>
              <button type="button" @click="history(p.id)">Ver versões de {{ p.name }}</button>
            </li>
          </ul>
          <article v-for="p in publications" :key="p.id">
            <h3>Versão publicada · revisão {{ p.revision }}</h3>
            <pre>{{ JSON.stringify(p.content, null, 2) }}</pre>
            <button type="button" @click="history(p.patternId)">Ver versões deste padrão</button>
          </article>
          <CatalogVersionHistory
            v-if="historyPatternId"
            :versions="versions"
            :next-cursor="nextCursor"
            :before-id="beforeId"
            :after-id="afterId"
            :comparison="comparison"
            :may-publish="mayPublish"
            :catalog-root="catalogPath"
            :api="api"
            :disabled="disabled || busy"
            :confirm-discard="confirmDiscard"
            @update:before-id="beforeId = $event"
            @update:after-id="afterId = $event"
            @load-more="history(historyPatternId, nextCursor ?? undefined)"
            @compare="compare"
            @suspend="suspend"
            @review-dirty="onReviewDirty"
            @lock="busy = $event"
          />
          <template v-if="mayEdit">
            <KnowledgeLibraryPanel
              :key="`${catalog.id}:${libraryKey}`"
              :catalog-id="catalog.id"
              :content="content"
              :api="api"
              :disabled="disabled"
              :confirm-discard="confirmDiscard"
              @dirty="libraryDirty = $event"
              @lock="busy = $event"
              @imported="importedDdl"
              @open-draft="emit('openDraft', $event)"
            />
            <KnowledgeCurationPanel
              v-if="catalog"
              :key="`${catalog.id}:${curationKey}`"
              :catalog-id="catalog.id"
              :role="catalog.role"
              :patterns="patterns"
              :api="api"
              :disabled="disabled"
              :draft-dirty="dirty"
              :confirm-discard="confirmDiscard"
              @dirty="curationDirty = $event"
              @lock="busy = $event"
              @updated="curationUpdated"
            />
            <CatalogPatternEditor
              :pattern-id="patternId"
              :slug="slug"
              :name="name"
              :content="content"
              :dirty="dirty"
              :may-publish="mayPublish"
              :review-date="reviewDate"
              :preview="preview"
              :confirmed="confirmed"
              @update:slug="slug = $event"
              @update:name="name = $event"
              @update:content="content = $event"
              @update:review-date="reviewDate = $event"
              @update:confirmed="confirmed = $event"
              @new-pattern="newPattern"
              @save="save"
              @import-file="importFile"
              @prepare="prepare"
              @publish="publish"
            />
          </template>
          <CatalogMembersForm
            v-if="catalog.role === 'administrator'"
            :members="members"
            :client-id="clientId"
            :role="role"
            @update:client-id="clientId = $event"
            @update:role="role = $event"
            @save="setMember"
          />
        </template>
      </fieldset>
    </section>
  </details>
</template>

<style scoped>
section,
form {
  display: grid;
  gap: 0.75rem;
}
label {
  display: grid;
  gap: 0.3rem;
}
fieldset {
  display: grid;
  gap: 1rem;
  min-width: 0;
}
pre {
  max-height: 24rem;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
input,
select,
button {
  max-width: 100%;
}
</style>
