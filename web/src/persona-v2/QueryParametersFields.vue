<script setup lang="ts">
import type { Training } from "./model";
import { queryRulesFromText } from "./query-training";
import { addTrainingParameter } from "./training-draft";

const training = defineModel<Training>({ required: true });
</script>
<template>
  <h3>Parâmetros</h3>
  <fieldset v-for="(parameter, i) in training.parameters" :key="i" class="row">
    <legend>Parâmetro {{ i + 1 }}</legend>
    <label>Nome do parâmetro<input v-model="parameter.name" required /></label
    ><label
      >Tipo do parâmetro<select v-model="parameter.type">
        <option>string</option>
        <option>number</option>
        <option>integer</option>
        <option>decimal</option>
        <option>boolean</option>
        <option>date</option>
        <option>datetime</option>
      </select></label
    ><label>Significado do parâmetro<input v-model="parameter.meaning" required /></label
    ><label class="check"><input v-model="parameter.required" type="checkbox" />Obrigatório</label
    ><button type="button" @click="training.parameters.splice(i, 1)">Remover parâmetro</button>
  </fieldset>
  <button type="button" @click="addTrainingParameter(training)">Adicionar parâmetro</button>
  <label
    >Regras de negócio (uma por linha)<textarea
      :value="training.rules.join('\n')"
      @input="training.rules = queryRulesFromText(($event.target as HTMLTextAreaElement).value)"
    /></label
  ><label
    >Exemplo de SQL<textarea v-model="training.sqlModel" class="sql" spellcheck="false" required />
  </label>
</template>
