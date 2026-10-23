<script setup lang="ts">
import type { TypedScalar } from "../../../src/domain/persona-v2/operation";
import { scalar, scalarTypes } from "./operation-editor";
import OperationScalarInput from "./OperationScalarInput.vue";
defineProps<{ columns: readonly string[]; label: string; limit?: number }>();
const rows = defineModel<Record<string, TypedScalar>[]>({ required: true });
</script>
<template>
  <fieldset>
    <legend>{{ label }}</legend>
    <p>
      Tipos e valores explícitos; inteiros e decimais são textuais. Use somente material sintético
      autorizado.
    </p>
    <fieldset v-for="(row, i) in rows" :key="i">
      <legend>Registro {{ i + 1 }}</legend>
      <div v-for="(value, name) in row" :key="name">
        <label
          >Tipo de {{ name
          }}<select
            :value="value.type"
            @change="
              row[name] = scalar(($event.target as HTMLSelectElement).value as TypedScalar['type'])
            "
          >
            <option v-for="type in scalarTypes" :key="type" :value="type">{{ type }}</option>
            <option value="null">Nulo</option>
          </select></label
        >
        <OperationScalarInput
          :model-value="value"
          :type="value.type === 'null' ? 'string' : value.type"
          :label="String(name)"
          @update:model-value="row[name] = $event"
        />
        <button type="button" @click="delete row[name]">Omitir campo {{ name }}</button>
      </div>
      <label
        >Adicionar campo ao registro<select
          value=""
          @change="
            row[($event.target as HTMLSelectElement).value] = scalar('string');
            ($event.target as HTMLSelectElement).value = '';
          "
        >
          <option value="" disabled>Selecione</option>
          <option v-for="c in columns.filter((c) => !(c in row))" :key="c" :value="c">
            {{ c }}
          </option>
        </select></label
      >
      <button type="button" @click="rows.splice(i, 1)">Remover registro {{ i + 1 }}</button>
    </fieldset>
    <button
      type="button"
      :disabled="rows.length >= (limit ?? 100) || !columns.length"
      @click="rows.push(Object.fromEntries(columns.map((c) => [c, scalar('string')])))"
    >
      Adicionar registro em {{ label }}
    </button>
  </fieldset>
</template>
