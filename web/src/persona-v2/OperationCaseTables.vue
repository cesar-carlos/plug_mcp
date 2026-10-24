<script setup lang="ts">
import type { TypedScalar } from "../../../src/domain/persona-v2/operation";
import { scalar, type OperationTraining } from "./operation-editor";
import OperationNameList from "./OperationNameList.vue";
import OperationScalarInput from "./OperationScalarInput.vue";
defineProps<{ training: OperationTraining; title: string; fixtures?: boolean }>();
const tables = defineModel<
  { table: string; generated?: string[]; rows: Record<string, TypedScalar>[] }[]
>({ required: true });
</script>
<template>
  <fieldset>
    <legend>{{ title }}</legend>
    <fieldset v-for="(table, i) in tables" :key="i">
      <legend>{{ title }} · tabela {{ i + 1 }}</legend>
      <label
        >Tabela do caso<select v-model="table.table" required>
          <option :value="table.table">{{ table.table || "Selecione" }}</option>
          <option v-for="t in training.tables" :key="t.name">{{ t.name }}</option>
        </select></label
      >
      <OperationNameList
        v-if="fixtures"
        :model-value="table.generated ?? []"
        label="Colunas geradas, separadas por vírgula"
        @update:model-value="table.generated = $event"
      />
      <fieldset v-for="(row, index) in table.rows" :key="index">
        <legend>Registro sintético {{ index + 1 }}</legend>
        <div v-for="(value, column) in row" :key="column">
          <OperationScalarInput
            :model-value="value"
            :type="
              training.tables
                .find((t) => t.name === table.table)
                ?.columns.find((c) => c.name === column)?.type ??
              (value.type === 'null' ? 'string' : value.type)
            "
            :label="String(column)"
            @update:model-value="row[column] = $event"
          />
          <button type="button" @click="delete row[column]">Omitir {{ column }}</button>
        </div>
        <label
          >Adicionar campo ao registro<select
            value=""
            @change="
              {
                const c = training.tables
                  .find((t) => t.name === table.table)
                  ?.columns.find((c) => c.name === ($event.target as HTMLSelectElement).value);
                if (c) row[c.name] = scalar(c.type);
                ($event.target as HTMLSelectElement).value = '';
              }
            "
          >
            <option value="">Selecione</option>
            <option
              v-for="c in training.tables
                .find((t) => t.name === table.table)
                ?.columns.filter((c) => !(c.name in row)) ?? []"
              :key="c.name"
            >
              {{ c.name }}
            </option>
          </select></label
        >
        <button type="button" @click="table.rows.splice(index, 1)">Remover registro</button>
      </fieldset>
      <button
        type="button"
        :disabled="table.rows.length >= 100 || !table.table"
        @click="
          table.rows.push(
            Object.fromEntries(
              (training.tables.find((t) => t.name === table.table)?.columns ?? [])
                .filter((c) => !table.generated?.includes(c.name))
                .map((c) => [c.name, scalar(c.type)]),
            ),
          )
        "
      >
        Adicionar registro sintético
      </button>
      <button type="button" @click="tables.splice(i, 1)">Remover tabela do caso</button>
    </fieldset>
    <button
      type="button"
      :disabled="tables.length >= 32"
      @click="tables.push({ table: '', ...(fixtures ? { generated: [] } : {}), rows: [] })"
    >
      Adicionar tabela em {{ title }}
    </button>
  </fieldset>
</template>
