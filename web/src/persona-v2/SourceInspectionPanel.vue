<script setup lang="ts">
import SourceInspectionResult from "./SourceInspectionResult.vue";
import SourceInspectionScopeForm from "./SourceInspectionScopeForm.vue";
import type { Content, Inspection } from "./knowledge-model";
import type { Source } from "./model";
import { useSourceInspection } from "./use-source-inspection";

const props = defineProps<{
  source: Source;
  sourceBase: string;
  api: <T>(url: string, body?: unknown) => Promise<T>;
  disabled: boolean;
  content?: Content;
}>();
const emit = defineEmits<{
  result: [value: Inspection | undefined];
  dirty: [value: boolean];
  lock: [value: boolean];
}>();
const {
  resources,
  pages,
  result,
  busy,
  expired,
  error,
  errorSummary,
  usePublishedScope,
  addResource,
  removeResource,
  inspect,
  compose,
} = useSourceInspection(props, emit);
</script>
<template>
  <section aria-label="Inspeção estrutural">
    <h3>Inspecionar a estrutura da base</h3>
    <p>
      Informe os recursos exatos. A inspeção usa somente metadados pelo plug_server e plug_agente;
      não consulta registros de negócio nem confirma seu significado.
    </p>
    <p v-if="error" ref="errorSummary" role="alert" tabindex="-1" class="error">{{ error }}</p>
    <p v-if="expired" role="status" class="notice">
      A evidência expirou. Inspecione novamente antes de comparar ou publicar.
    </p>
    <SourceInspectionScopeForm
      v-model:resources="resources"
      :dialect="source.dialect"
      :disabled="disabled || busy || !source.active"
      :has-content="!!content"
      @add="addResource"
      @remove="removeResource"
      @use-published="usePublishedScope"
      @inspect="inspect(0)"
    />
    <p v-if="busy" role="status">Inspecionando metadados autorizados…</p>
    <div v-if="pages.length > 1 && !result?.evidence.composition">
      <p>
        Páginas vigentes reunidas: {{ pages.length }}. Combinar não adota ou publica conhecimento.
      </p>
      <button type="button" :disabled="disabled || busy || !source.active" @click="compose">
        Combinar páginas inspecionadas
      </button>
    </div>
    <SourceInspectionResult
      v-if="result"
      :result="result"
      :dialect="source.dialect"
      :disabled="disabled || busy"
      @next="inspect"
    />
  </section>
</template>
