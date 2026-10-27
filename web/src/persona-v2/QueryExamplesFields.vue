<script setup lang="ts">
import type { Training } from "./model";
import { queryExampleState } from "./query-training";
import { addTrainingExample } from "./training-draft";

defineProps<{
  duplicateExamples: readonly [string, string][];
}>();
const training = defineModel<Training>({ required: true });
</script>
<template>
  <h3>Outros exemplos de consulta</h3>
  <p v-for="pair in duplicateExamples" :key="pair.join(':')" class="notice">
    Possível duplicação entre {{ pair[0] }} e {{ pair[1] }}. Revise a finalidade antes de
    consolidar; nenhuma alteração foi aplicada.
  </p>
  <p>Os exemplos usam a mesma base, estrutura e parâmetros deste treinamento.</p>
  <div v-for="(example, index) in training.examples ?? []" :key="index" class="relationship">
    <label
      >Identificação do exemplo<input
        v-model="example.id"
        pattern="[a-z][a-z0-9_-]*"
        maxlength="100"
        required
    /></label>
    <label>Finalidade do exemplo<input v-model="example.purpose" required /></label>
    <label
      >Estado editorial do exemplo<select
        :value="example.state ?? 'approved'"
        @change="example.state = queryExampleState(($event.target as HTMLSelectElement).value)"
      >
        <option value="candidate">Candidato — exige revisão</option>
        <option value="approved">Revisado para publicação</option>
        <option value="inactive">Inativo</option>
        <option value="replaced">Substituído</option>
      </select></label
    >
    <label>Explicação do exemplo<textarea v-model="example.explanation" required /></label>
    <label
      >SQL do exemplo<textarea v-model="example.sql" class="sql" spellcheck="false" required />
    </label>
    <button type="button" @click="training.examples?.splice(index, 1)">Remover exemplo</button>
  </div>
  <button type="button" @click="addTrainingExample(training)">Adicionar exemplo SQL</button>
</template>
