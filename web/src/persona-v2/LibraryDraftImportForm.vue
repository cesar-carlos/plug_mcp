<script setup lang="ts">
import type { StructureContent } from "../../../src/domain/persona-v2/shared-knowledge";
import type { LibraryItem, LibrarySource } from "./library-panel";

const props = defineProps<{
  template: StructureContent;
  personas: { id: string; name: string }[];
  personaId: string;
  sources: LibrarySource[];
  sourceId: string;
  chosenDialect: string;
  exampleId: string;
  additionalExampleIds: string[];
  additionalExamples: StructureContent["examples"];
  datasets: LibraryItem[];
  datasetId: string;
  skillSlug: string;
  skillName: string;
  submitDisabled: boolean;
}>();
const emit = defineEmits<{
  "update:personaId": [value: string];
  "update:sourceId": [value: string];
  "update:chosenDialect": [value: string];
  "update:exampleId": [value: string];
  "update:additionalExampleIds": [value: string[]];
  "update:datasetId": [value: string];
  "update:skillSlug": [value: string];
  "update:skillName": [value: string];
  loadPersonas: [];
  loadSources: [];
  apply: [];
}>();

function toggleAdditional(id: string, checked: boolean): void {
  const next = props.additionalExampleIds.filter((item) => item !== id);
  if (checked) {
    next.push(id);
  }
  emit("update:additionalExampleIds", next);
}
</script>

<template>
  <form aria-label="Criar treinamento de template" @submit.prevent="emit('apply')">
    <h4>Criar rascunho de consulta</h4>
    <button type="button" @click="emit('loadPersonas')">Carregar personas para o template</button>
    <label
      >Persona de destino<select
        :value="personaId"
        required
        @change="
          emit('update:personaId', ($event.target as HTMLSelectElement).value);
          emit('loadSources');
        "
      >
        <option value="">Selecione</option>
        <option v-for="p in personas" :key="p.id" :value="p.id">{{ p.name }}</option>
      </select></label
    >
    <label
      >Base de destino<select
        :value="sourceId"
        required
        @change="emit('update:sourceId', ($event.target as HTMLSelectElement).value)"
      >
        <option value="">Selecione</option>
        <option v-for="s in sources" :key="s.id" :value="s.id">
          {{ s.name }} · {{ s.dialect }}
        </option>
      </select></label
    >
    <label
      >Variante de dialeto<select
        :value="chosenDialect"
        required
        @change="emit('update:chosenDialect', ($event.target as HTMLSelectElement).value)"
      >
        <option value="">Selecione explicitamente</option>
        <option v-for="d in template.dialects" :key="d" :value="d">{{ d }}</option>
      </select></label
    >
    <label
      >Exemplo principal<select
        :value="exampleId"
        required
        @change="emit('update:exampleId', ($event.target as HTMLSelectElement).value)"
      >
        <option value="">Selecione</option>
        <option v-for="e in template.examples" :key="e.id" :value="e.id">
          {{ e.purpose }}
        </option>
      </select></label
    >
    <fieldset v-if="exampleId && additionalExamples.length">
      <legend>Exemplos adicionais para o rascunho</legend>
      <p>
        Selecione explicitamente. Devem usar os mesmos parâmetros do principal; todos permanecerão
        candidatos.
      </p>
      <label v-for="e in additionalExamples" :key="e.id">
        <input
          type="checkbox"
          :value="e.id"
          :checked="additionalExampleIds.includes(e.id)"
          @change="toggleAdditional(e.id, ($event.target as HTMLInputElement).checked)"
        />{{ e.purpose }}
      </label>
    </fieldset>
    <label
      >Dataset opcional da mesma versão<select
        :value="datasetId"
        @change="emit('update:datasetId', ($event.target as HTMLSelectElement).value)"
      >
        <option value="">Sem dataset</option>
        <option v-for="d in datasets" :key="d.id" :value="d.id">
          {{ d.name }} · versão {{ d.version }}
        </option>
      </select></label
    >
    <label
      >Identificador do novo treinamento<input
        :value="skillSlug"
        required
        maxlength="100"
        pattern="[a-z0-9]+(-[a-z0-9]+)*"
        @input="emit('update:skillSlug', ($event.target as HTMLInputElement).value)" /></label
    ><label
      >Nome do novo treinamento<input
        :value="skillName"
        required
        maxlength="200"
        @input="emit('update:skillName', ($event.target as HTMLInputElement).value)"
    /></label>
    <button :disabled="submitDisabled">Criar rascunho com base e variante selecionadas</button>
  </form>
</template>

<style scoped>
form,
fieldset,
label {
  display: grid;
  gap: 0.6rem;
  min-width: 0;
}
input,
select,
button {
  max-width: 100%;
}
</style>
