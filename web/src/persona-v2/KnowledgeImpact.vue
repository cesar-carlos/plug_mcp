<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import type { KnowledgeImpact } from "../../../src/domain/persona-v2/shared-knowledge";
import { knowledgeImpactQuerySchema } from "../../../src/domain/persona-v2/knowledge-impact";
import { useErrorSummary } from "./useErrorSummary";
const props = defineProps<{
  root: string;
  query?: Readonly<Record<string, string>>;
  label?: string;
  disabled: boolean;
  api: <T>(url: string, body?: unknown) => Promise<T>;
}>();
const result = ref<KnowledgeImpact>();
const busy = ref(false);
const table = ref(""),
  column = ref("");
const { error, errorSummary } = useErrorSummary();
let epoch = 0;
watch(
  () => JSON.stringify([props.root, props.query]),
  () => {
    epoch++;
    result.value = undefined;
    error.value = "";
    busy.value = false;
    table.value = "";
    column.value = "";
  },
);
watch([table, column], () => {
  epoch++;
  result.value = undefined;
  error.value = "";
  busy.value = false;
});
onBeforeUnmount(() => {
  epoch++;
});
async function load(after?: string) {
  if (busy.value || props.disabled) return;
  const own = ++epoch;
  busy.value = true;
  error.value = "";
  if (!after) result.value = undefined;
  try {
    const filter = knowledgeImpactQuerySchema.parse({
      ...(table.value ? { table: table.value } : {}),
      ...(column.value ? { column: column.value } : {}),
      ...(after ? { after } : {}),
    });
    const query = new URLSearchParams({ ...props.query, ...filter }).toString();
    const data = await props.api<KnowledgeImpact>(
      `${props.root}/impacto${query ? `?${query}` : ""}`,
    );
    if (own !== epoch) return;
    result.value = {
      ...data,
      publications: after
        ? [...(result.value?.publications ?? []), ...data.publications]
        : data.publications,
    };
  } catch (cause) {
    if (own === epoch)
      error.value =
        cause instanceof Error ? cause.message : "Não foi possível consultar o impacto.";
  } finally {
    if (own === epoch) busy.value = false;
  }
}
</script>
<template>
  <section :aria-label="label ?? 'Impacto do padrão publicado'">
    <p>
      Somente publicações das suas personas. A consulta não mostra dependências de outros
      responsáveis nem confirma disponibilidade de execução.
    </p>
    <form @submit.prevent="load()">
      <fieldset :disabled="disabled || busy">
        <legend>Filtrar dependências estruturais publicadas</legend>
        <label
          >Tabela ou view<input
            v-model="table"
            placeholder="schema.tabela ou tabela"
            maxlength="200"
        /></label>
        <label>Coluna opcional<input v-model="column" maxlength="100" /></label>
        <p>
          Sem schema significa recurso sem schema explícito; não pesquisa todos os schemas. O filtro
          considera somente a estrutura fixada na publicação, sem inferir dependências antigas
          ausentes.
        </p>
        <button type="submit">Ver impacto desta versão</button>
      </fieldset>
    </form>
    <p v-if="error" ref="errorSummary" role="alert" tabindex="-1" class="error">{{ error }}</p>
    <template v-if="result">
      <p v-if="!result.publications.length">
        Nenhuma dependência visível registrada nas suas personas.
      </p>
      <ul>
        <li v-for="item in result.publications" :key="item.publicationId">
          {{ item.personaName }} — {{ item.name }} · revisão {{ item.revision }} ·
          {{ item.direct ? "Dependência direta" : "Dependência indireta" }} ·
          {{
            item.suspended ? "Suspensa" : item.active ? "Publicação ativa" : "Publicação histórica"
          }}
          <p v-if="item.sources.length">
            Bases: {{ item.sources.map((source) => source.name).join(", ") }}
          </p>
        </li>
      </ul>
      <p v-if="result.nextCursor">Lista parcial; há mais dependências visíveis.</p>
      <button
        v-if="result.nextCursor"
        type="button"
        :disabled="disabled || busy"
        @click="load(result.nextCursor)"
      >
        Carregar mais dependências
      </button>
    </template>
  </section>
</template>
