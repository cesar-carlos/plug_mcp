<script setup lang="ts">
import {
  canAddDatasetRow,
  datasetCellInputMode,
  isBooleanDatasetType,
  type DatasetTableEdit,
  type DatasetTemplateTable,
} from "./knowledge-dataset-editor";

defineProps<{
  eligible: readonly DatasetTemplateTable[];
  remaining: readonly DatasetTemplateTable[];
  rowCount: number;
  cellCount: number;
  fields: (table: DatasetTableEdit) => readonly DatasetTemplateTable["columns"][number][];
}>();
const chosenTable = defineModel<string>("chosenTable", { required: true });
const tables = defineModel<DatasetTableEdit[]>("tables", { required: true });
const emit = defineEmits<{
  addTable: [];
  addRow: [table: DatasetTableEdit];
  removeTable: [table: DatasetTableEdit];
  removeRow: [table: DatasetTableEdit, index: number];
}>();
</script>
<template>
  <label
    >Tabela do template<select v-model="chosenTable">
      <option value="">Selecione</option>
      <option v-for="table in remaining" :key="table.id" :value="table.id">
        {{ table.name }}
      </option>
    </select></label
  >
  <button type="button" :disabled="!chosenTable" @click="emit('addTable')">
    Adicionar tabela ao dataset
  </button>
  <p v-if="!eligible.length">
    O template não possui campos livres com tipos lógicos reconhecidos. Revise o template antes de
    criar um dataset.
  </p>
  <fieldset v-for="table in tables" :key="table.id">
    <legend>{{ eligible.find((item) => item.id === table.id)?.name }}</legend>
    <p>Escolha os campos. Desmarcar preserva a edição em memória, mas exclui o campo do envio.</p>
    <label v-for="field in fields(table)" :key="field.name"
      ><input v-model="table.columns" type="checkbox" :value="field.name" />{{ field.name }} ·
      {{ field.logicalType }}</label
    >
    <fieldset v-for="(row, index) in table.rows" :key="index">
      <legend>Linha {{ index + 1 }}</legend>
      <template
        v-for="field in fields(table).filter((column) => table.columns.includes(column.name))"
        :key="field.name"
      >
        <label v-if="isBooleanDatasetType(field.logicalType)"
          >{{ field.name
          }}<select
            v-model="row[field.name]!.text"
            :aria-label="field.name"
            :disabled="row[field.name]!.isNull"
          >
            <option value="">Selecione</option>
            <option value="true">Verdadeiro</option>
            <option value="false">Falso</option>
          </select></label
        >
        <label v-else
          >{{ field.name
          }}<input
            v-model="row[field.name]!.text"
            :disabled="row[field.name]!.isNull"
            maxlength="2000"
            :inputmode="datasetCellInputMode(field.logicalType)"
        /></label>
        <label v-if="field.nullable"
          ><input v-model="row[field.name]!.isNull" type="checkbox" />{{ field.name }}: valor
          nulo</label
        >
      </template>
      <button type="button" @click="emit('removeRow', table, index)">
        Remover linha {{ index + 1 }}
      </button>
    </fieldset>
    <button
      type="button"
      :disabled="
        !table.columns.length || !canAddDatasetRow(rowCount, cellCount, table.columns.length)
      "
      @click="emit('addRow', table)"
    >
      Adicionar linha
    </button>
    <button type="button" @click="emit('removeTable', table)">Remover tabela do dataset</button>
  </fieldset>
  <p>
    {{ rowCount }} linhas · {{ cellCount }} células. Limites: 1.000 linhas, 20.000 células e 50 KiB.
  </p>
</template>
<style scoped>
fieldset,
label {
  display: grid;
  gap: 0.6rem;
  min-width: 0;
}
input,
select,
button {
  max-width: 100%;
  box-sizing: border-box;
}
</style>
