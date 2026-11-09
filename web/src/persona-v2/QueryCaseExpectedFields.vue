<script setup lang="ts">
import { computed } from "vue";
import type { QueryPublicationCase } from "../../../src/domain/persona-v2/publication-fixture";
import FederationTypedRowsEditor from "./FederationTypedRowsEditor.vue";
import { scalarTypes } from "./operation-editor";
import { emptyQueryCaseExpectedColumn, setQueryCaseCompleteness } from "./query-case-editor";

const expected = defineModel<QueryPublicationCase["expected"]>({ required: true });
const completenessMode = computed({
  get: () => expected.value.completeness?.mode ?? "complete",
  set: (mode: "complete" | "sql_limit") => setQueryCaseCompleteness(expected.value, mode),
});
</script>
<template>
  <fieldset>
    <legend>Resultado esperado</legend>
    <label
      >Completude esperada<select v-model="completenessMode">
        <option value="complete">Resultado completo</option>
        <option value="sql_limit">Ranking limitado por TOP (SQL Server)</option>
      </select></label
    >
    <template v-if="expected.completeness?.mode === 'sql_limit'">
      <label
        >Limite TOP esperado<input
          v-model.number="expected.completeness.maxRows"
          type="number"
          min="1"
          max="100"
          step="1"
          required
      /></label>
      <p>
        Declare o mesmo TOP inteiro do SQL, com ORDER BY e desempate explícito. O runner compara
        todas as linhas esperadas na ordem e exige transporte sem truncamento. A resposta ao
        consumidor continua parcial; este caso não comprova o total da fonte. PERCENT, WITH TIES,
        OFFSET e limites internos não são aceitos.
      </p>
    </template>
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
      ><input
        v-model="expected.ordered"
        type="checkbox"
        :disabled="completenessMode === 'sql_limit'"
      />Comparar a ordem dos registros</label
    >
    <FederationTypedRowsEditor
      v-model="expected.rows"
      :columns="expected.columns.map((c) => c.name).filter(Boolean)"
      label="Resultado esperado"
    />
  </fieldset>
</template>
