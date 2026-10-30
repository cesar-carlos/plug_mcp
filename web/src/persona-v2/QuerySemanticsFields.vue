<script setup lang="ts">
import type { Training } from "./model";
const training = defineModel<Training>({ required: true });
function enable() {
  training.value.semantics ??= { version: 1, synonyms: [], metrics: [] };
}
function addMetric() {
  enable();
  training.value.semantics!.metrics.push({
    id: "",
    name: "",
    definition: "",
    aggregation: "sum",
    inputs: [],
    grain: [],
    unit: "",
    timePolicy: "",
    filters: [],
    nullPolicy: "",
    negativePolicy: "",
    reconciliation: "",
  });
}
function refs(event: Event) {
  return Array.from((event.target as HTMLSelectElement).selectedOptions).map((option) => {
    const column = training.value.columns[Number(option.value)];
    return { table: column.table, column: column.name };
  });
}
</script>
<template>
  <details>
    <summary>Métricas e termos comerciais</summary>
    <p>
      Defina o significado antes de publicar. Estas definições não executam SQL nem comprovam
      resultados. Métricas exigem casos obrigatórios e relatório atual.
    </p>
    <button v-if="!training.semantics" type="button" @click="enable">
      Definir semântica comercial
    </button>
    <template v-if="training.semantics">
      <label
        >Sinônimos da consulta (um por linha)
        <textarea
          :value="training.semantics.synonyms.join('\n')"
          @change="
            training.semantics.synonyms = ($event.target as HTMLTextAreaElement).value
              .split('\n')
              .map((s) => s.trim())
              .filter(Boolean)
          "
        />
      </label>
      <fieldset v-for="(metric, index) in training.semantics.metrics" :key="index">
        <legend>Métrica {{ index + 1 }}</legend>
        <label
          >Identificador<input v-model="metric.id" required pattern="[a-z][a-z0-9_]{0,63}"
        /></label>
        <label>Nome<input v-model="metric.name" required /></label>
        <label
          >Definição e fórmula comercial<textarea v-model="metric.definition" required />
        </label>
        <label
          >Agregação<select v-model="metric.aggregation">
            <option
              v-for="value in [
                'sum',
                'count',
                'count_distinct',
                'min',
                'max',
                'average',
                'ratio',
                'classification',
              ] as const"
              :key="value"
              :value="value"
            >
              {{ value }}
            </option>
          </select></label
        >
        <label
          >Campos utilizados<select multiple required @change="metric.inputs = refs($event)">
            <option
              v-for="(column, position) in training.columns"
              :key="position"
              :value="position"
              :selected="
                metric.inputs.some((r) => r.table === column.table && r.column === column.name)
              "
            >
              {{ column.table }}.{{ column.name }}
            </option>
          </select></label
        >
        <label
          >Grão da medida<select multiple required @change="metric.grain = refs($event)">
            <option
              v-for="(column, position) in training.columns"
              :key="position"
              :value="position"
              :selected="
                metric.grain.some((r) => r.table === column.table && r.column === column.name)
              "
            >
              {{ column.table }}.{{ column.name }}
            </option>
          </select></label
        >
        <label>Unidade e moeda<input v-model="metric.unit" required /></label>
        <label>Período, calendário e fuso<textarea v-model="metric.timePolicy" required /></label>
        <label
          >Filtros comerciais (um por linha)<textarea
            :value="metric.filters.join('\n')"
            @change="
              metric.filters = ($event.target as HTMLTextAreaElement).value
                .split('\n')
                .map((s) => s.trim())
                .filter(Boolean)
            "
          />
        </label>
        <label>Tratamento de nulos<textarea v-model="metric.nullPolicy" required /></label>
        <label
          >Valores negativos e devoluções<textarea v-model="metric.negativePolicy" required />
        </label>
        <label
          >Conciliação, descontos, frete e impostos<textarea
            v-model="metric.reconciliation"
            required
          />
        </label>
        <button type="button" @click="training.semantics.metrics.splice(index, 1)">
          Remover métrica do rascunho
        </button>
      </fieldset>
      <button type="button" :disabled="training.semantics.metrics.length >= 50" @click="addMetric">
        Adicionar métrica
      </button>
    </template>
  </details>
</template>
