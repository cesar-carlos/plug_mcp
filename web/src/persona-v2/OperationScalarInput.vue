<script setup lang="ts">
import type { TypedScalar } from "../../../src/domain/persona-v2/operation";
import { scalar } from "./operation-editor";
withDefaults(
  defineProps<{ label: string; type: Exclude<TypedScalar["type"], "null">; allowNull?: boolean }>(),
  { allowNull: true },
);
const value = defineModel<TypedScalar>({ required: true });
</script>
<template>
  <label v-if="allowNull"
    ><input
      type="checkbox"
      :checked="value.type === 'null'"
      @change="value = scalar(($event.target as HTMLInputElement).checked ? 'null' : type)"
    />{{ label }}: nulo</label
  >
  <label v-if="value.type !== 'null'"
    >{{ label }} ({{ value.type }})
    <select
      v-if="value.type === 'boolean'"
      :value="String(value.value)"
      @change="
        value = { type: 'boolean', value: ($event.target as HTMLSelectElement).value === 'true' }
      "
    >
      <option value="true">Verdadeiro</option>
      <option value="false">Falso</option>
    </select>
    <input
      v-else
      v-model="value.value"
      :inputmode="value.type === 'decimal' || value.type === 'integer' ? 'decimal' : 'text'"
      maxlength="65536"
      autocomplete="off"
    />
  </label>
</template>
