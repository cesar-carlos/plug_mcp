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
const listed = computed(
  () => presentation.value.facts.length > 0 || presentation.value.tables.length > 0,
);
</script>

<template>
  <div>
    <dl v-if="presentation.facts.length > 0" class="facts">
      <div v-for="(fact, index) in presentation.facts" :key="`${fact.label}-${index}`">
        <dt>{{ fact.label }}</dt>
        <dd>{{ fact.value }}</dd>
      </div>
    </dl>
    <section v-for="table in presentation.tables" :key="table.title" class="data-block">
      <h3>{{ table.title }}</h3>
      <p v-if="table.rows.length === 0" class="empty">{{ empty ?? table.empty }}</p>
      <table v-else class="data">
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
    </section>
    <details class="raw" :open="!listed">
      <summary>JSON</summary>
      <JsonBlock :value="value" />
    </details>
  </div>
</template>
