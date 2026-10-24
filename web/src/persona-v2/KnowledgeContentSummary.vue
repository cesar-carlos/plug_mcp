<script setup lang="ts">
import RelationshipDiagram from "./RelationshipDiagram.vue";
import { physicalName, type Content } from "./knowledge-model";
import type { Dialect } from "./model";
defineProps<{ content: Content; dialect: Dialect; draft?: boolean }>();
const classifications: Record<string, string> = {
  livre: "Livre",
  sensivel: "Sensível",
  pessoal: "Pessoal",
  segredo: "Segredo",
  inferido: "Ainda não revisado",
};
</script>
<template>
  <div aria-label="Conhecimento publicado selecionado">
    <p>
      {{ content.system }} · versão {{ content.label }}.
      {{
        draft ? "Conteúdo proposto, ainda não publicado." : "Declarações e significados publicados."
      }}
      A compatibilidade técnica é verificada separadamente.
    </p>
    <details v-for="table in content.tables" :key="table.id">
      <summary>{{ physicalName(table, dialect) }} — {{ table.meaning }}</summary>
      <p>Grão: {{ table.grain.join(", ") || "Não declarado" }}.</p>
      <ul>
        <li v-for="column in table.columns" :key="column.name">
          <strong>{{ column.name }}</strong
          >: {{ column.meaning }} · {{ classifications[column.classification] }} ·
          {{ column.logicalType }} · {{ column.nullable ? "Aceita nulo" : "Não aceita nulo"
          }}<span v-if="column.unit"> · Unidade: {{ column.unit }}</span
          ><span v-if="column.currency"> · Moeda: {{ column.currency }}</span>
        </li>
      </ul>
    </details>
    <RelationshipDiagram
      :tables="content.tables.map((t) => ({ id: t.id, name: physicalName(t, dialect) }))"
      :relationships="content.relationships"
    />
    <ul v-if="content.rules.length" aria-label="Regras compartilhadas">
      <li v-for="(rule, index) in content.rules" :key="index">{{ rule }}</li>
    </ul>
  </div>
</template>
