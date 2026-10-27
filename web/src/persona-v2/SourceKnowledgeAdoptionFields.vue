<script setup lang="ts">
import type { Content } from "./knowledge-model";
import type { OperationTraining } from "./operation-editor";
import {
  sourceKnowledgeAdoptionHelp,
  sourceKnowledgeAdoptionLegend,
  sourceKnowledgeColumnDisabled,
  sourceKnowledgeColumnHint,
  sourceKnowledgeSelectAll,
  sourceKnowledgeTableAllowed,
} from "./source-knowledge";

const props = defineProps<{
  content: Content;
  operationTraining?: OperationTraining;
  disabled: boolean;
}>();
const tables = defineModel<string[]>("tables", { required: true });
const fields = defineModel<string[]>("fields", { required: true });
const emit = defineEmits<{
  pending: [];
}>();

function selectAll(): void {
  const selected = sourceKnowledgeSelectAll(props.content, props.operationTraining);
  tables.value = selected.tables;
  fields.value = selected.fields;
  emit("pending");
}

function markPending(): void {
  emit("pending");
}
</script>

<template>
  <fieldset :disabled="disabled">
    <legend>{{ sourceKnowledgeAdoptionLegend(!!operationTraining) }}</legend>
    <p>{{ sourceKnowledgeAdoptionHelp(!!operationTraining) }}</p>
    <button type="button" class="secondary" @click="selectAll">
      Selecionar tabelas e campos livres
    </button>
    <fieldset v-for="table in content.tables" :key="table.id">
      <legend>{{ table.name }} — {{ table.meaning }}</legend>
      <label class="check">
        <input
          v-model="tables"
          type="checkbox"
          :value="table.id"
          :disabled="!sourceKnowledgeTableAllowed(table, operationTraining)"
          @change="markPending"
        />Usar tabela {{ table.name }}
      </label>
      <template v-if="tables.includes(table.id)">
        <label v-for="column in table.columns" :key="column.name" class="check">
          <input
            v-model="fields"
            type="checkbox"
            :value="`${table.id}.${column.name}`"
            :disabled="sourceKnowledgeColumnDisabled(table, column, operationTraining)"
            @change="markPending"
          />{{ column.name }} — {{ column.meaning
          }}{{ sourceKnowledgeColumnHint(column.classification) }}
        </label>
      </template>
    </fieldset>
  </fieldset>
</template>
