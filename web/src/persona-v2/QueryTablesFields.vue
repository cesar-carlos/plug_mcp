<script setup lang="ts">
import { splitList } from "./console-display";
import type { Training } from "./model";
import { queryResourceType } from "./query-training";
import { addTrainingTable } from "./training-draft";

const training = defineModel<Training>({ required: true });
</script>
<template>
  <h3>Tabelas</h3>
  <div v-for="(table, i) in training.tables" :key="i" class="row">
    <label>Nome físico<input v-model="table.name" placeholder="dbo.pedidos" required /></label
    ><label
      >Tipo do recurso<select
        :value="table.resourceType ?? 'table'"
        @change="table.resourceType = queryResourceType(($event.target as HTMLSelectElement).value)"
      >
        <option value="table">Tabela</option>
        <option value="view">View</option>
      </select></label
    ><label>Significado<input v-model="table.meaning" required /></label
    ><label
      >Colunas que identificam um registro<input
        :value="table.grain.join(', ')"
        placeholder="id"
        required
        @input="table.grain = splitList(($event.target as HTMLInputElement).value)" /></label
    ><button type="button" @click="training.tables.splice(i, 1)">Remover tabela</button>
  </div>
  <button type="button" @click="addTrainingTable(training)">Adicionar tabela</button>
</template>
