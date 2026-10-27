<script setup lang="ts">
import KnowledgeDatasetEditor from "./KnowledgeDatasetEditor.vue";
import LibraryDdlImportForm from "./LibraryDdlImportForm.vue";
import LibraryDraftImportForm from "./LibraryDraftImportForm.vue";
import LibraryMaterialForm from "./LibraryMaterialForm.vue";
import type { ImportedDraftReference } from "./model";
import type { StructureContent } from "../../../src/domain/persona-v2/shared-knowledge";
import { useLibraryPanel } from "./use-library-panel";

const props = defineProps<{
  catalogId: string;
  content: unknown;
  api: <T>(url: string, body?: unknown) => Promise<T>;
  disabled: boolean;
  confirmDiscard: () => Promise<boolean>;
}>();
const emit = defineEmits<{
  dirty: [boolean];
  lock: [boolean];
  imported: [StructureContent];
  openDraft: [ImportedDraftReference];
}>();
const {
  createdDraft,
  items,
  cursor,
  selected,
  payload,
  slug,
  name,
  datasetDirty,
  datasetEditorVersion,
  historyVersion,
  datasetId,
  ddl,
  system,
  label,
  dialect,
  declaration,
  personas,
  personaId,
  sources,
  sourceId,
  chosenDialect,
  exampleId,
  additionalExampleIds,
  skillSlug,
  skillName,
  error,
  errorSummary,
  message,
  busy,
  template,
  additionalExamples,
  datasets,
  materialUnsaved,
  datasetEditorBlocked,
  load,
  choose,
  fresh,
  capture,
  save,
  saveDataset,
  parseDdl,
  readDdl,
  loadPersonas,
  loadSources,
  apply,
  consultVersion,
  useDeclarations,
} = useLibraryPanel(props, emit);
</script>

<template>
  <details>
    <summary>Templates, datasets e importação de DDL</summary>
    <section aria-label="Biblioteca editorial do catálogo">
      <p>
        Material versionado para revisão. Não concede execução, não contém relatórios aprovados e
        não é adotado automaticamente.
      </p>
      <p v-if="error" ref="errorSummary" class="error" role="alert" tabindex="-1">{{ error }}</p>
      <p v-if="message" role="status">{{ message }}</p>
      <fieldset :disabled="disabled || busy">
        <template v-if="createdDraft">
          <button
            type="button"
            aria-describedby="imported-draft-hint"
            @click="emit('openDraft', createdDraft)"
          >
            Abrir treinamento criado
          </button>
          <p id="imported-draft-hint" class="technical-value">
            Abre a revisão salva mais recente de {{ createdDraft.name }} na persona de destino. A
            troca limpa o token de teste e os resultados exibidos; alterações não salvas exigem
            confirmação. Não publica nem executa consultas.
          </p>
        </template>
        <button type="button" @click="load()">Carregar biblioteca</button
        ><button v-if="cursor" type="button" @click="load(true)">
          Carregar materiais anteriores
        </button>
        <ul>
          <li v-for="item in items" :key="item.id">
            <button type="button" @click="choose(item)">
              {{ item.name }} · {{ item.kind }} · versão {{ item.version }}
            </button>
          </li>
        </ul>
        <button type="button" @click="fresh">Novo material editorial</button
        ><button type="button" :disabled="!content" @click="capture">
          Criar template do conteúdo em edição
        </button>
        <LibraryMaterialForm
          :selected="!!selected"
          :slug="slug"
          :name="name"
          :payload="payload"
          :history-version="historyVersion"
          :dataset-dirty="datasetDirty"
          @update:slug="slug = $event"
          @update:name="name = $event"
          @update:payload="payload = $event"
          @update:history-version="historyVersion = $event"
          @save="save"
          @consult-version="consultVersion"
        />
        <KnowledgeDatasetEditor
          v-if="template && selected"
          :key="`${selected.id}:${selected.version}:${datasetEditorVersion}`"
          :template="{
            id: selected.id,
            version: selected.version,
            hash: selected.hash,
            name: selected.name,
            content: template,
          }"
          :disabled="datasetEditorBlocked"
          @dirty="datasetDirty = $event"
          @create="saveDataset"
        />
        <LibraryDraftImportForm
          v-if="template"
          :template="template"
          :personas="personas"
          :persona-id="personaId"
          :sources="sources"
          :source-id="sourceId"
          :chosen-dialect="chosenDialect"
          :example-id="exampleId"
          :additional-example-ids="additionalExampleIds"
          :additional-examples="additionalExamples"
          :datasets="datasets"
          :dataset-id="datasetId"
          :skill-slug="skillSlug"
          :skill-name="skillName"
          :submit-disabled="datasetDirty || materialUnsaved"
          @update:persona-id="personaId = $event"
          @update:source-id="sourceId = $event"
          @update:chosen-dialect="chosenDialect = $event"
          @update:example-id="exampleId = $event"
          @update:additional-example-ids="additionalExampleIds = $event"
          @update:dataset-id="datasetId = $event"
          @update:skill-slug="skillSlug = $event"
          @update:skill-name="skillName = $event"
          @load-personas="loadPersonas"
          @load-sources="loadSources"
          @apply="apply"
        />
        <LibraryDdlImportForm
          :system="system"
          :label="label"
          :dialect="dialect"
          :ddl="ddl"
          :declaration="declaration"
          @update:system="system = $event"
          @update:label="label = $event"
          @update:dialect="dialect = $event"
          @update:ddl="ddl = $event"
          @parse="parseDdl"
          @read-file="readDdl"
          @use-declarations="useDeclarations"
        />
      </fieldset>
    </section>
  </details>
</template>

<style scoped>
section,
form,
fieldset,
label {
  display: grid;
  gap: 0.6rem;
  min-width: 0;
}
textarea {
  max-width: 100%;
  width: 100%;
  box-sizing: border-box;
}
input,
select,
button {
  max-width: 100%;
}
</style>
