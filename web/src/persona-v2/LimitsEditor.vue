<script setup lang="ts">
import {
  QUERY_LIMITS,
  OPERATION_LIMITS,
  type QueryLimits,
  type OperationLimits,
} from "../../../src/domain/persona-v2/execution-limits";
import {
  DEFAULT_FEDERATION_BUDGET,
  type FederationBudget,
} from "../../../src/domain/persona-v2/federation";
type Limits = Partial<QueryLimits & OperationLimits & FederationBudget>;
const props = defineProps<{
  modelValue?: Limits;
  kind: "query" | "operation" | "federation";
  label: string;
}>();
const emit = defineEmits<{ "update:modelValue": [value: Limits | undefined] }>();
const ceilings = {
  query: QUERY_LIMITS,
  operation: OPERATION_LIMITS,
  federation: DEFAULT_FEDERATION_BUDGET,
};
const labels: Record<string, string> = {
  maxRows: "Máximo de linhas",
  maxBytes: "Resposta máxima (bytes)",
  timeoutMs: "Prazo de execução (ms)",
  pageSize: "Máximo de linhas por página",
  maxAffectedRows: "Linhas diretamente afetadas",
  sources: "Máximo de bases",
  steps: "Máximo de etapas",
  concurrency: "Consultas simultâneas",
  rowsPerSource: "Linhas por base",
  intermediateRows: "Linhas intermediárias",
  intermediateBytes: "Tamanho intermediário (bytes)",
};
function setValue(key: string, event: Event) {
  const value = (event.target as HTMLInputElement).value;
  const limits = { ...props.modelValue };
  if (value === "") delete limits[key as keyof Limits];
  else limits[key as keyof Limits] = Number(value);
  emit("update:modelValue", limits);
}
</script>
<template>
  <fieldset>
    <legend>{{ label }}</legend>
    <label class="check"
      ><input
        type="checkbox"
        :checked="modelValue !== undefined"
        @change="
          emit('update:modelValue', ($event.target as HTMLInputElement).checked ? {} : undefined)
        "
      />Definir limites menores</label
    >
    <template v-if="modelValue !== undefined">
      <label v-for="(max, key) in ceilings[kind]" :key="key"
        >{{ labels[key] }}
        <input
          type="number"
          min="1"
          :max="max"
          step="1"
          :value="modelValue[key as keyof Limits]"
          placeholder="Conservar teto anterior"
          @input="setValue(String(key), $event)"
        />
      </label>
      <p>
        Vale sempre o menor teto vigente. Em branco conserva o limite anterior; não amplia skill,
        token, consentimento ou plataforma.
      </p>
    </template>
  </fieldset>
</template>
