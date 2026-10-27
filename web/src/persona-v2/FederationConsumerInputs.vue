<script setup lang="ts">
import type { FederationLocalInput } from "./federation-consumer";

defineProps<{
  inputs: FederationLocalInput[];
  sourceName: (id: string) => string;
  disabled: boolean;
  busy: boolean;
  bearer: string;
}>();
const pageSize = defineModel<number>("pageSize", { required: true });
const emit = defineEmits<{
  execute: [validation: boolean];
}>();
</script>
<template>
  <fieldset :disabled="disabled || busy">
    <div v-for="input in inputs" :key="input.id">
      <h4>{{ input.name }} · {{ sourceName(input.sourceId) }}</h4>
      <label
        >SQL da etapa {{ input.id
        }}<textarea v-model="input.sql" class="sql" spellcheck="false" maxlength="30000" />
      </label>
      <div v-for="parameter in input.parameters" :key="parameter.name">
        <label
          >{{ parameter.meaning }} ({{ input.id }}.{{ parameter.name }})<select
            v-if="parameter.type === 'boolean'"
            v-model="input.values[parameter.name]"
            :disabled="!!input.modes[parameter.name] && input.modes[parameter.name] !== 'value'"
          >
            <option value="">Escolha</option>
            <option value="true">Sim</option>
            <option value="false">Não</option></select
          ><input
            v-else
            v-model="input.values[parameter.name]"
            :disabled="!!input.modes[parameter.name] && input.modes[parameter.name] !== 'value'"
        /></label>
        <label
          >Como enviar {{ input.id }}.{{ parameter.name
          }}<select v-model="input.modes[parameter.name]">
            <option :value="undefined">Valor informado</option>
            <option v-if="parameter.type === 'string'" value="empty">Texto vazio</option>
            <option v-if="!parameter.required" value="null">Nulo explícito</option>
            <option v-if="!parameter.required" value="omit">Omitir parâmetro</option>
          </select></label
        >
      </div>
    </div>
    <label
      >Linhas por página do cruzamento<select v-model.number="pageSize">
        <option :value="25">25</option>
        <option :value="50">50</option>
        <option :value="100">100</option>
      </select></label
    >
    <button type="button" :disabled="!bearer" @click="emit('execute', true)">
      Validar cruzamento
    </button>
    <button type="button" :disabled="!bearer" @click="emit('execute', false)">
      Consultar cruzamento
    </button>
  </fieldset>
</template>
