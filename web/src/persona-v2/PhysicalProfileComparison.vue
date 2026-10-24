<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import type { z } from "zod";
import {
  physicalProfileComparisonSchema,
  type PhysicalProfilePublication,
} from "../../../src/domain/persona-v2/physical-profile";
import { useErrorSummary } from "./useErrorSummary";
const props = defineProps<{
  publications: readonly PhysicalProfilePublication[];
  catalogId: string;
  sourceBase: string;
  disabled: boolean;
  api: <T>(url: string, body?: unknown) => Promise<T>;
}>();
const beforeId = ref(""),
  afterId = ref(""),
  busy = ref(false);
const comparison = ref<z.infer<typeof physicalProfileComparisonSchema>>();
const { error, errorSummary } = useErrorSummary();
let epoch = 0;
const candidates = computed(() =>
  props.publications.filter(
    (p) => p.id === props.publications.find((v) => v.publicationId === beforeId.value)?.id,
  ),
);
watch(
  () => [props.catalogId, props.sourceBase, props.publications],
  () => {
    epoch++;
    beforeId.value = "";
    afterId.value = "";
    comparison.value = undefined;
    error.value = "";
    busy.value = false;
  },
);
watch([beforeId, afterId], () => {
  epoch++;
  comparison.value = undefined;
  error.value = "";
  busy.value = false;
});
onBeforeUnmount(() => {
  epoch++;
});
async function compare() {
  if (busy.value || props.disabled) return;
  const own = ++epoch;
  busy.value = true;
  error.value = "";
  comparison.value = undefined;
  try {
    const result = physicalProfileComparisonSchema.parse(
      await props.api(`${props.sourceBase}/perfis/comparar`, {
        catalogId: props.catalogId,
        beforeId: beforeId.value,
        afterId: afterId.value,
      }),
    );
    if (own === epoch) comparison.value = result;
  } catch (cause) {
    if (own === epoch)
      error.value =
        cause instanceof Error ? cause.message : "Não foi possível comparar as versões.";
  } finally {
    if (own === epoch) busy.value = false;
  }
}
const kinds = { added: "Acrescentado", removed: "Removido", changed: "Alterado" };
const display = (value: unknown) => (typeof value === "string" ? value : JSON.stringify(value));
</script>
<template>
  <section aria-label="Histórico de perfis físicos">
    <h4>Comparar versões publicadas</h4>
    <p>
      A comparação não adota conhecimento, publica alterações ou amplia permissões. Carregue mais
      versões na lista de perfis quando necessário.
    </p>
    <p v-if="error" ref="errorSummary" role="alert" tabindex="-1" class="error">{{ error }}</p>
    <form @submit.prevent="compare">
      <fieldset :disabled="disabled || busy">
        <legend>Versões do mesmo perfil desta base</legend>
        <label
          >Versão anterior<select v-model="beforeId" required>
            <option value="">Selecione</option>
            <option v-for="p in publications" :key="p.publicationId" :value="p.publicationId">
              {{ p.name }} · revisão {{ p.revision }}{{ p.suspended ? " · suspensa" : "" }}
            </option>
          </select></label
        >
        <label
          >Versão posterior<select v-model="afterId" required>
            <option value="">Selecione</option>
            <option v-for="p in candidates" :key="p.publicationId" :value="p.publicationId">
              {{ p.name }} · revisão {{ p.revision }}{{ p.suspended ? " · suspensa" : "" }}
            </option>
          </select></label
        >
        <button
          type="submit"
          :disabled="!beforeId || !candidates.some((p) => p.publicationId === afterId)"
        >
          Comparar perfis publicados
        </button>
      </fieldset>
    </form>
    <section v-if="comparison" aria-label="Diferenças do perfil físico" aria-live="polite">
      <p>
        Revisão {{ comparison.before.revision }} → {{ comparison.after.revision }}. Suspensão:
        {{ comparison.before.suspended ? "sim" : "não" }} →
        {{ comparison.after.suspended ? "sim" : "não" }}.
      </p>
      <p v-if="!comparison.sections.length">Nenhuma diferença de conteúdo.</p>
      <details v-for="section in comparison.sections" :key="section.id" open>
        <summary>{{ section.label }} · {{ section.changes.length }} alterações</summary>
        <ul>
          <li v-for="change in section.changes" :key="change.path">
            <strong>{{ kinds[change.kind] }}: {{ change.label }}</strong>
            <p v-if="change.kind !== 'added'">Anterior: {{ display(change.before) }}</p>
            <p v-if="change.kind !== 'removed'">Posterior: {{ display(change.after) }}</p>
          </li>
        </ul>
      </details>
    </section>
  </section>
</template>
