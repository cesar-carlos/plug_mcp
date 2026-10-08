<script lang="ts">
export default { name: "DataView" };
</script>

<script setup lang="ts">
import { computed } from "vue";
import { presentPayload } from "../data-view";
import JsonBlock from "./JsonBlock.vue";

const props = defineProps<{
  value: unknown;
  empty?: string;
}>();

const presentation = computed(() => presentPayload(props.value));
</script>

<template>
  <div>
    <p v-if="presentation.facts.length === 0 && presentation.tables.length === 0" class="empty">
      {{ empty ?? "Nenhum dado disponível." }}
    </p>
    <dl v-if="presentation.facts.length > 0" class="facts">
      <div v-for="(fact, index) in presentation.facts" :key="`${fact.label}-${index}`">
        <dt>{{ fact.label }}</dt>
        <dd>{{ fact.value }}</dd>
      </div>
    </dl>
    <section v-for="table in presentation.tables" :key="table.title" class="data-block">
      <h3>{{ table.title }}</h3>
      <p v-if="table.rows.length === 0" class="empty">{{ empty ?? table.empty }}</p>
      <div v-else class="table-scroll" tabindex="0" :aria-label="table.title">
        <table class="data">
          <thead>
            <tr>
              <th v-for="column in table.columns" :key="column">{{ column }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, rowIndex) in table.rows" :key="rowIndex">
              <td v-for="(cell, cellIndex) in row" :key="cellIndex">{{ cell }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
    <details class="raw">
      <summary>JSON</summary>
      <JsonBlock :value="value" />
    </details>
  </div>
</template>
