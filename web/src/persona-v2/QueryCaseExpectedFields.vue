<script setup lang="ts">
import type { QueryPublicationCase } from "../../../src/domain/persona-v2/publication-fixture";
import FederationTypedRowsEditor from "./FederationTypedRowsEditor.vue";
import { scalarTypes } from "./operation-editor";
import { emptyQueryCaseExpectedColumn } from "./query-case-editor";

const expected = defineModel<QueryPublicationCase["expected"]>({ required: true });
</script>
<template>
  <fieldset>
    <legend>Resultado esperado</legend>
    <div v-for="(column, index) in expected.columns" :key="index">
      <label>Coluna esperada<input v-model="column.name" required /></label>
      <label
        >Tipo esperado<select v-model="column.type">
          <option v-for="type in scalarTypes" :key="type" :value="type">{{ type }}</option>
        </select></label
      >
      <button type="button" @click="expected.columns.splice(index, 1)">
        Remover coluna esperada {{ index + 1 }}
      </button>
    </div>
    <button
      type="button"
      :disabled="expected.columns.length >= 100"
      @click="expected.columns.push(emptyQueryCaseExpectedColumn())"
    >
      Adicionar coluna esperada
    </button>
    <label
      ><input v-model="expected.ordered" type="checkbox" />Comparar a ordem dos registros</label
    >
    <FederationTypedRowsEditor
      v-model="expected.rows"
      :columns="expected.columns.map((c) => c.name).filter(Boolean)"
      label="Resultado esperado"
    />
  </fieldset>
</template>
