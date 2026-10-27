<script setup lang="ts">
import StructureEditor from "./StructureEditor.vue";
import { catalogChangeLabels } from "./catalog-labels";
import type { CatalogPreview } from "./catalog-panel";

defineProps<{
  patternId: string;
  slug: string;
  name: string;
  content: unknown;
  dirty: boolean;
  mayPublish: boolean;
  reviewDate: string;
  preview: CatalogPreview | undefined;
  confirmed: boolean;
}>();
const emit = defineEmits<{
  "update:slug": [value: string];
  "update:name": [value: string];
  "update:content": [value: unknown];
  "update:reviewDate": [value: string];
  "update:confirmed": [value: boolean];
  newPattern: [];
  save: [];
  importFile: [event: Event];
  prepare: [];
  publish: [];
}>();
</script>

<template>
  <button type="button" @click="emit('newPattern')">Novo padrão</button>
  <form aria-label="Editar padrão compartilhado" @submit.prevent="emit('save')">
    <label
      >Identificação do padrão<input
        :value="slug"
        :disabled="!!patternId"
        pattern="[a-z0-9]+(-[a-z0-9]+)*"
        maxlength="100"
        required
        @input="emit('update:slug', ($event.target as HTMLInputElement).value)"
    /></label>
    <label
      >Nome do padrão<input
        :value="name"
        maxlength="200"
        required
        @input="emit('update:name', ($event.target as HTMLInputElement).value)"
    /></label>
    <StructureEditor :model-value="content" @update:model-value="emit('update:content', $event)" />
    <label
      >Importar estrutura revisada<input
        type="file"
        accept=".json,application/json"
        @change="emit('importFile', $event)"
    /></label>
    <p>
      Opcional: importe uma estrutura em JSON para revisar pelo formulário. Arquivos importados não
      são executados no banco.
    </p>
    <details v-if="content !== undefined">
      <summary>Conferir conteúdo importado</summary>
      <pre>{{ JSON.stringify(content, null, 2) }}</pre>
    </details>
    <p v-if="dirty">Há alterações não salvas.</p>
    <button :disabled="content === undefined">Salvar padrão</button>
  </form>
  <label v-if="mayPublish"
    >Prazo de revisão da publicação<input
      :value="reviewDate"
      type="datetime-local"
      @input="emit('update:reviewDate', ($event.target as HTMLInputElement).value)"
  /></label>
  <button v-if="mayPublish" type="button" :disabled="!patternId || dirty" @click="emit('prepare')">
    Revisar padrão para publicação
  </button>
  <div v-if="preview">
    <p>Próxima revisão: {{ new Date(preview.reviewDueAt).toLocaleString() }}</p>
    <p>Campos alterados: {{ preview.changedFields.join(", ") }}</p>
    <ul>
      <li v-for="c in preview.changes" :key="c.path">
        {{ catalogChangeLabels[c.kind] }}: {{ c.path }}
      </li>
    </ul>
    <p>Validade: {{ new Date(preview.expiresAt).toLocaleString() }}</p>
    <p v-for="warning in preview.warnings" :key="warning">{{ warning }}</p>
    <details>
      <summary>Conteúdo exato da publicação</summary>
      <pre>{{ JSON.stringify(preview.content, null, 2) }}</pre>
    </details>
    <label
      ><input
        :checked="confirmed"
        type="checkbox"
        @change="emit('update:confirmed', ($event.target as HTMLInputElement).checked)"
      />Revisei a estrutura, os significados e os exemplos desta versão.</label
    >
    <button
      type="button"
      :disabled="!confirmed || dirty || Date.parse(preview.expiresAt) <= Date.now()"
      @click="emit('publish')"
    >
      Confirmar publicação do padrão
    </button>
  </div>
</template>

<style scoped>
form {
  display: grid;
  gap: 0.75rem;
}
label {
  display: grid;
  gap: 0.3rem;
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
