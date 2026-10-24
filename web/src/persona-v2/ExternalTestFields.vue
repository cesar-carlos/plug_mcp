<script setup lang="ts">
import type { ExternalContract } from "../../../src/domain/persona-v2/external-contract";
import type { ExternalTestValue } from "./external-test-values";
defineProps<{ fields: ExternalContract["input"]; prefix: string; disabled: boolean }>();
const values = defineModel<Record<string, ExternalTestValue>>({ required: true });
</script>
<template>
  <fieldset :disabled="disabled">
    <legend>{{ prefix }}</legend>
    <div v-for="(field, key) in fields" :key="key">
      <label v-if="!field.required"
        ><input v-model="values[key]!.enabled" type="checkbox" />Incluir {{ prefix }}
        {{ key }}</label
      >
      <label
        >{{ prefix }} {{ key }} {{ field.required ? "(obrigatório)" : "(opcional)" }}
        <select
          v-if="field.type === 'boolean'"
          v-model="values[key]!.value"
          :disabled="!values[key]!.enabled"
        >
          <option value="true">Verdadeiro</option>
          <option value="false">Falso</option>
        </select>
        <input
          v-else
          v-model="values[key]!.value"
          :disabled="!values[key]!.enabled"
          :inputmode="field.type === 'number' ? 'decimal' : 'text'"
          maxlength="8192"
          autocomplete="off"
        />
      </label>
      <p>{{ field.purpose }}</p>
    </div>
  </fieldset>
</template>
