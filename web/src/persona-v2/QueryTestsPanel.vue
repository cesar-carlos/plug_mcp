<script setup lang="ts">
import type { Training } from "./model";
import QueryCaseEditor from "./QueryCaseEditor.vue";
import QueryTestReports from "./QueryTestReports.vue";
import { useQueryTests } from "./use-query-tests";

const props = defineProps<{
  root: string;
  revision: number;
  disabled: boolean;
  training: Training;
  confirmDiscard: () => Promise<boolean>;
  api: <T>(url: string, body?: unknown) => Promise<T>;
}>();
const emit = defineEmits<{ dirty: [boolean]; lock: [boolean]; saved: [number] }>();
const {
  editorKey,
  caseDirty,
  message,
  details,
  busy,
  error,
  errorSummary,
  load,
  loadDatasetOptions,
  loadDatasetSeeds,
  save,
} = useQueryTests(props, emit);
</script>
<template>
  <section aria-label="Casos e relatórios da consulta" :aria-busy="busy">
    <h3>Casos e relatórios da consulta</h3>
    <p>
      O runner de operador executa testes em bases isoladas. Esta leitura não consulta dados, aprova
      evidências ou publica treinamento.
    </p>
    <p v-if="error" ref="errorSummary" role="alert" tabindex="-1">{{ error }}</p>
    <p v-if="message" role="status">{{ message }}</p>
    <QueryCaseEditor
      :key="editorKey"
      :training="training"
      :cases="details?.cases ?? []"
      :disabled="disabled || busy"
      :confirm-discard="confirmDiscard"
      :load-dataset-seeds="loadDatasetSeeds"
      :load-dataset-options="loadDatasetOptions"
      @dirty="caseDirty = $event"
      @save="save"
    />
    <button type="button" :disabled="disabled || busy" @click="load()">
      Consultar testes da consulta
    </button>
    <QueryTestReports
      v-if="details"
      :details="details"
      :disabled="disabled || busy"
      @more="load(true)"
    />
  </section>
</template>
