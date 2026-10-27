<script setup lang="ts">
import type { FederationPlan } from "../../../src/domain/persona-v2/federation";
import type { FederationConsumerResult } from "./federation-consumer";

defineProps<{
  result: FederationConsumerResult;
  submitted?: FederationPlan;
  contextName?: string;
  sourceName: (id: string) => string;
  disabled: boolean;
  busy: boolean;
}>();
const emit = defineEmits<{
  page: [number];
}>();
</script>
<template>
  <div>
    <p class="success" role="status">
      Cruzamento completo · {{ result.totalRows }} registros na combinação · Página
      {{ result.page }}
    </p>
    <p>
      Publicação: {{ contextName }}. As leituras das bases ocorreram em momentos próprios; não há
      uma transação distribuída.
    </p>
    <ul>
      <li v-for="origin in result.provenance" :key="`${origin.sourceId}:${origin.publicationId}`">
        {{ sourceName(origin.sourceId) }} · Leitura:
        {{ new Date(origin.readAt).toLocaleString() }}
        <details>
          <summary>Publicação de origem</summary>
          {{ origin.publicationId }} · {{ origin.publicationHash }}
        </details>
      </li>
    </ul>
    <details>
      <summary>SQL e filtros utilizados no cruzamento</summary>
      <pre>{{ JSON.stringify(submitted, null, 2) }}</pre>
    </details>
    <p v-if="!result.rows.length">Nenhum registro retornado nesta página do cruzamento.</p>
    <div class="scroll" tabindex="0" role="region" aria-label="Tabela do cruzamento">
      <table>
        <caption>
          Resultado do cruzamento
        </caption>
        <thead>
          <tr>
            <th v-for="column in result.columns" :key="column" scope="col">{{ column }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, index) in result.rows" :key="index">
            <td v-for="column in result.columns" :key="column">
              {{ row[column] === null ? "Nulo" : row[column] }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <button
      type="button"
      :disabled="disabled || busy || result.page <= 1"
      @click="emit('page', result.page - 1)"
    >
      Página anterior do cruzamento
    </button>
    <button
      type="button"
      :disabled="disabled || busy || result.page * result.pageSize >= result.totalRows"
      @click="emit('page', result.page + 1)"
    >
      Próxima página do cruzamento
    </button>
  </div>
</template>
