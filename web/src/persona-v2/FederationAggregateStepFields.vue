<script setup lang="ts">
import type { TrainingStep } from "./federation-editor";
import { federationColumnChoices } from "./federation-step-editor";

const step = defineModel<Extract<TrainingStep, { kind: "aggregate" }>>({ required: true });
defineProps<{ previous: TrainingStep[] }>();
</script>
<template>
  <label
    >Etapa de entrada<select v-model="step.input" required>
      <option value="">Selecione</option>
      <option v-for="s in previous" :key="s.id" :value="s.id">
        {{ s.id }}
      </option>
      <option v-if="step.input && !previous.some((s) => s.id === step.input)" :value="step.input">
        {{ step.input }} · referência inválida
      </option>
    </select></label
  >
  <label
    >Dimensões<select v-model="step.dimensions" multiple>
      <option
        v-for="c in federationColumnChoices(previous, step.input, step.dimensions)"
        :key="c"
        :value="c"
      >
        {{ c }}
      </option>
    </select></label
  >
  <div v-for="(measure, k) in step.measures" :key="k">
    <label
      >Função {{ k + 1
      }}<select v-model="measure.operation">
        <option value="count">Contar</option>
        <option value="sum">Somar</option>
        <option value="min">Mínimo</option>
        <option value="max">Máximo</option>
      </select></label
    >
    <label
      >Campo da medida {{ k + 1
      }}<select
        :value="measure.column ?? ''"
        :required="measure.operation !== 'count'"
        @change="measure.column = ($event.target as HTMLSelectElement).value || undefined"
      >
        <option value="">Todos (contagem)</option>
        <option
          v-for="c in federationColumnChoices(
            previous,
            step.input,
            measure.column ? [measure.column] : [],
          )"
          :key="c"
          :value="c"
        >
          {{ c }}
        </option>
      </select></label
    >
    <label
      >Nome da medida {{ k + 1 }}<input v-model="measure.as" required pattern="[a-z][a-z0-9_]*"
    /></label>
    <label
      >Tipo da medida {{ k + 1
      }}<select
        :value="measure.valueType ?? 'scalar'"
        @change="
          measure.valueType = ($event.target as HTMLSelectElement).value as 'scalar' | 'decimal'
        "
      >
        <option value="scalar">Escalar</option>
        <option value="decimal">Decimal exato textual</option>
      </select></label
    >
    <button type="button" @click="step.measures.splice(k, 1)">Remover medida {{ k + 1 }}</button>
  </div>
  <button
    type="button"
    :disabled="step.measures.length >= 200"
    @click="step.measures.push({ operation: 'count', as: '' })"
  >
    Adicionar medida
  </button>
</template>
