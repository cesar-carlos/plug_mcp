<script setup lang="ts">
defineProps<{
  selected: boolean;
  slug: string;
  name: string;
  payload: string;
  historyVersion: number;
  datasetDirty: boolean;
}>();
const emit = defineEmits<{
  "update:slug": [value: string];
  "update:name": [value: string];
  "update:payload": [value: string];
  "update:historyVersion": [value: number];
  save: [];
  consultVersion: [];
}>();
</script>

<template>
  <form aria-label="Salvar material da biblioteca" @submit.prevent="emit('save')">
    <label
      >Identificador do material<input
        :value="slug"
        :disabled="selected"
        required
        maxlength="100"
        pattern="[a-z0-9]+(-[a-z0-9]+)*"
        @input="emit('update:slug', ($event.target as HTMLInputElement).value)"
    /></label>
    <label
      >Nome do material<input
        :value="name"
        required
        maxlength="200"
        @input="emit('update:name', ($event.target as HTMLInputElement).value)"
    /></label>
    <label
      >Material JSON (template ou dataset)<textarea
        :value="payload"
        required
        rows="10"
        spellcheck="false"
        @input="emit('update:payload', ($event.target as HTMLTextAreaElement).value)"
      />
    </label>
    <p>
      Até 50 KiB. Dataset exige proveniência sintética ou autorização explícita,
      template/versão/hash exatos e valores tipados; decimais usam texto.
    </p>
    <button :disabled="datasetDirty">
      {{ selected ? "Salvar próxima versão editorial" : "Salvar primeiro material" }}
    </button>
  </form>
  <form
    v-if="selected"
    aria-label="Versão histórica da biblioteca"
    @submit.prevent="emit('consultVersion')"
  >
    <label
      >Versão para consultar<input
        :value="historyVersion"
        type="number"
        min="1"
        required
        @input="emit('update:historyVersion', ($event.target as HTMLInputElement).valueAsNumber)"
    /></label>
    <button>Consultar versão exata</button>
  </form>
</template>

<style scoped>
form,
label {
  display: grid;
  gap: 0.6rem;
  min-width: 0;
}
textarea {
  max-width: 100%;
  width: 100%;
  box-sizing: border-box;
}
input,
select,
button {
  max-width: 100%;
}
</style>
