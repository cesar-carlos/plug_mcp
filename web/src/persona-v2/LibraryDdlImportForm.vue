<script setup lang="ts">
import type { StructureContent } from "../../../src/domain/persona-v2/shared-knowledge";

defineProps<{
  system: string;
  label: string;
  dialect: string;
  ddl: string;
  declaration: { content: StructureContent; warnings: string[] } | undefined;
}>();
const emit = defineEmits<{
  "update:system": [value: string];
  "update:label": [value: string];
  "update:dialect": [value: string];
  "update:ddl": [value: string];
  parse: [];
  readFile: [event: Event];
  useDeclarations: [];
}>();
</script>

<template>
  <form aria-label="Importar estrutura DDL" @submit.prevent="emit('parse')">
    <h4>Interpretar DDL sem executar</h4>
    <label
      >Sistema declarado<input
        :value="system"
        required
        maxlength="200"
        @input="emit('update:system', ($event.target as HTMLInputElement).value)" /></label
    ><label
      >Rótulo da estrutura<input
        :value="label"
        required
        maxlength="100"
        @input="emit('update:label', ($event.target as HTMLInputElement).value)"
    /></label>
    <label
      >Dialeto do arquivo<select
        :value="dialect"
        @change="emit('update:dialect', ($event.target as HTMLSelectElement).value)"
      >
        <option value="postgres">PostgreSQL</option>
        <option value="mssql">SQL Server</option>
        <option value="sybase">SQL Anywhere</option>
      </select></label
    >
    <label
      >Arquivo DDL (até 50 KiB)<input
        type="file"
        accept=".sql,.ddl,.txt"
        @change="emit('readFile', $event)"
    /></label>
    <label
      >DDL estrutural<textarea
        :value="ddl"
        required
        rows="8"
        spellcheck="false"
        @input="emit('update:ddl', ($event.target as HTMLTextAreaElement).value)"
      />
    </label>
    <button>Interpretar declarações do arquivo</button>
  </form>
  <section v-if="declaration" aria-label="Declarações importadas">
    <ul>
      <li v-for="w in declaration.warnings" :key="w">{{ w }}</li>
    </ul>
    <p>
      {{ declaration.content.tables.length }} tabelas ·
      {{ declaration.content.relationships.length }} relações. Significado e confirmação técnica
      pendentes.
    </p>
    <button type="button" @click="emit('useDeclarations')">
      Usar declarações em novo rascunho de padrão
    </button>
  </section>
</template>

<style scoped>
form,
section,
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
