<script setup lang="ts">
import type { QueryPublicationCase } from "../../../src/domain/persona-v2/publication-fixture";
import FederationTypedRowsEditor from "./FederationTypedRowsEditor.vue";
import type { Training } from "./model";
import { emptyQueryCaseFixture } from "./query-case-editor";
import { queryColumnsForTable } from "./query-training";

defineProps<{ training: Training }>();
const fixtures = defineModel<QueryPublicationCase["input"]["fixtures"]>({ required: true });
</script>
<template>
  <fieldset v-for="(fixture, index) in fixtures" :key="index">
    <legend>Semente {{ index + 1 }}</legend>
    <label
      >Tabela da semente<select v-model="fixture.table">
        <option v-for="table in training.tables" :key="table.name" :value="table.name">
          {{ table.name }}
        </option>
      </select></label
    >
    <p>Ao trocar a tabela, revise os campos; nenhum valor é convertido automaticamente.</p>
    <label
      v-for="column in queryColumnsForTable(training.columns, fixture.table)"
      :key="column.name"
      ><input v-model="fixture.generated" type="checkbox" :value="column.name" />Gerado pelo banco:
      {{ column.name }}</label
    >
    <FederationTypedRowsEditor
      v-model="fixture.rows"
      :columns="queryColumnsForTable(training.columns, fixture.table).map((c) => c.name)"
      :label="`Semente ${index + 1}`"
    />
    <button type="button" @click="fixtures.splice(index, 1)">
      Remover semente {{ index + 1 }}
    </button>
  </fieldset>
  <button
    type="button"
    :disabled="!training.tables.length || fixtures.length >= 16"
    @click="fixtures.push(emptyQueryCaseFixture(training.tables[0]!.name))"
  >
    Adicionar semente
  </button>
</template>
