<script setup lang="ts">
import type { TrainingStep } from "./federation-editor";
import { federationColumnChoices } from "./federation-step-editor";

const step = defineModel<Extract<TrainingStep, { kind: "sort" }>>({ required: true });
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
  <div v-for="(order, k) in step.order" :key="k">
    <label
      >Campo de ordenação {{ k + 1
      }}<select v-model="order.column" required>
        <option value="">Selecione</option>
        <option
          v-for="c in federationColumnChoices(
            previous,
            step.input,
            order.column ? [order.column] : [],
          )"
          :key="c"
          :value="c"
        >
          {{ c }}
        </option>
      </select></label
    >
    <label
      >Direção {{ k + 1
      }}<select v-model="order.direction">
        <option value="asc">Crescente</option>
        <option value="desc">Decrescente</option>
      </select></label
    >
    <label
      >Nulos {{ k + 1
      }}<select v-model="order.nulls">
        <option value="first">No início</option>
        <option value="last">No fim</option>
      </select></label
    >
    <label
      >Tipo da ordenação {{ k + 1
      }}<select
        :value="order.valueType ?? 'scalar'"
        @change="
          order.valueType = ($event.target as HTMLSelectElement).value as 'scalar' | 'decimal'
        "
      >
        <option value="scalar">Escalar</option>
        <option value="decimal">Decimal exato textual</option>
      </select></label
    >
    <button type="button" @click="step.order.splice(k, 1)">Remover ordenação {{ k + 1 }}</button>
  </div>
  <button
    type="button"
    :disabled="step.order.length >= 200"
    @click="step.order.push({ column: '', direction: 'asc', nulls: 'last' })"
  >
    Adicionar ordenação
  </button>
</template>
