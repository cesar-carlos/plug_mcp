<script setup lang="ts">
import type { StructureContent } from "../../../src/domain/persona-v2/shared-knowledge";
import type { LibraryPayload } from "../../../src/application/persona-v2/knowledge-library-schema";
import KnowledgeDatasetTables from "./KnowledgeDatasetTables.vue";
import { useKnowledgeDatasetEditor } from "./use-knowledge-dataset-editor";

const props = defineProps<{
  template: { id: string; version: number; hash: string; name: string; content: StructureContent };
  disabled: boolean;
}>();
const emit = defineEmits<{
  dirty: [boolean];
  create: [{ slug: string; name: string; payload: Extract<LibraryPayload, { kind: "dataset" }> }];
}>();
const {
  slug,
  name,
  description,
  authorizationRef,
  provenance,
  chosenTable,
  tables,
  error,
  errorSummary,
  eligible,
  remaining,
  rowCount,
  cellCount,
  fields,
  addTable,
  addRow,
  removeTable,
  removeRow,
  reset,
  submit,
} = useKnowledgeDatasetEditor(props, emit);
</script>
<template>
  <details>
    <summary>Criar dataset com formulário</summary>
    <form aria-label="Criar dataset do template" @submit.prevent="submit">
      <p>
        {{ template.name }} · versão {{ template.version }}. A referência é fixa; atualizar o
        template não altera este material.
      </p>
      <p>
        Somente campos livres com tipo lógico reconhecido. Nenhuma consulta será executada. A
        validação definitiva ocorre no servidor.
      </p>
      <p v-if="error" ref="errorSummary" role="alert" class="error" tabindex="-1">{{ error }}</p>
      <fieldset :disabled="disabled">
        <label
          >Identificador do dataset<input
            v-model="slug"
            required
            maxlength="100"
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
        /></label>
        <label>Nome do dataset<input v-model="name" required maxlength="200" /></label>
        <label
          >Origem do material<select v-model="provenance">
            <option value="synthetic">Dados sintéticos</option>
            <option value="authorized">Material explicitamente autorizado</option>
          </select></label
        >
        <label
          >Descrição da proveniência<textarea v-model="description" required maxlength="2000" />
        </label>
        <label v-if="provenance === 'authorized'"
          >Referência da autorização<input v-model="authorizationRef" required maxlength="2000"
        /></label>
        <KnowledgeDatasetTables
          v-model:chosen-table="chosenTable"
          v-model:tables="tables"
          :eligible="eligible"
          :remaining="remaining"
          :row-count="rowCount"
          :cell-count="cellCount"
          :fields="fields"
          @add-table="addTable"
          @add-row="addRow"
          @remove-table="removeTable"
          @remove-row="removeRow"
        />
        <button :disabled="!tables.length">Salvar dataset editorial</button>
        <button type="button" @click="reset">Limpar edição do dataset</button>
      </fieldset>
    </form>
  </details>
</template>
<style scoped>
form,
fieldset,
label {
  display: grid;
  gap: 0.6rem;
  min-width: 0;
}
input,
textarea,
select,
button {
  max-width: 100%;
  box-sizing: border-box;
}
</style>
