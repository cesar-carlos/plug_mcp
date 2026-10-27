<script setup lang="ts">
import type { TrainingStep } from "./federation-editor";
import { federationColumnChoices } from "./federation-step-editor";

const step = defineModel<Extract<TrainingStep, { kind: "join" }>>({ required: true });
defineProps<{ previous: TrainingStep[] }>();
</script>
<template>
  <label
    >Etapa esquerda<select v-model="step.left" required>
      <option value="">Selecione</option>
      <option v-for="s in previous" :key="s.id" :value="s.id">
        {{ s.id }}
      </option>
      <option v-if="step.left && !previous.some((s) => s.id === step.left)" :value="step.left">
        {{ step.left }} · referência inválida
      </option>
    </select></label
  >
  <label
    >Etapa direita<select v-model="step.right" required>
      <option value="">Selecione</option>
      <option v-for="s in previous" :key="s.id" :value="s.id">
        {{ s.id }}
      </option>
      <option v-if="step.right && !previous.some((s) => s.id === step.right)" :value="step.right">
        {{ step.right }} · referência inválida
      </option>
    </select></label
  >
  <label
    >Tipo de combinação<select v-model="step.join">
      <option value="inner">Somente correspondentes (INNER)</option>
      <option value="left">Preservar esquerda (LEFT)</option>
    </select></label
  >
  <label
    >Cardinalidade<select v-model="step.cardinality">
      <option value="one_to_one">1:1</option>
      <option value="many_to_one">N:1</option>
      <option value="one_to_many">1:N</option>
    </select></label
  >
  <div v-for="(pair, k) in step.keys" :key="k">
    <label
      >Chave esquerda {{ k + 1
      }}<select v-model="pair.left" required>
        <option value="">Selecione</option>
        <option
          v-for="c in federationColumnChoices(previous, step.left, pair.left ? [pair.left] : [])"
          :key="c"
          :value="c"
        >
          {{ c }}
        </option>
      </select></label
    >
    <label
      >Chave direita {{ k + 1
      }}<select v-model="pair.right" required>
        <option value="">Selecione</option>
        <option
          v-for="c in federationColumnChoices(previous, step.right, pair.right ? [pair.right] : [])"
          :key="c"
          :value="c"
        >
          {{ c }}
        </option>
      </select></label
    >
    <button type="button" @click="step.keys.splice(k, 1)">Remover par {{ k + 1 }}</button>
  </div>
  <button
    type="button"
    :disabled="step.keys.length >= 16"
    @click="step.keys.push({ left: '', right: '' })"
  >
    Adicionar par de chaves
  </button>
  <div v-for="(column, k) in step.columns" :key="k">
    <label
      >Lado do campo {{ k + 1
      }}<select v-model="column.side">
        <option value="left">Esquerda</option>
        <option value="right">Direita</option>
      </select></label
    >
    <label
      >Campo retornado {{ k + 1
      }}<select v-model="column.column" required>
        <option value="">Selecione</option>
        <option
          v-for="c in federationColumnChoices(
            previous,
            column.side === 'left' ? step.left : step.right,
            column.column ? [column.column] : [],
          )"
          :key="c"
          :value="c"
        >
          {{ c }}
        </option>
      </select></label
    >
    <label
      >Nome de saída {{ k + 1 }}<input v-model="column.as" required pattern="[a-z][a-z0-9_]*"
    /></label>
    <button type="button" @click="step.columns.splice(k, 1)">Remover campo {{ k + 1 }}</button>
  </div>
  <button
    type="button"
    :disabled="step.columns.length >= 200"
    @click="step.columns.push({ side: 'left', column: '', as: '' })"
  >
    Adicionar campo combinado
  </button>
</template>
