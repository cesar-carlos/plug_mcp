<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { schemaInspectionSchema } from "../../../src/domain/persona-v2/source-schema";
import {
  inspectionResultSchema,
  scopeForContent,
  constraintLabels,
  type Inspection,
  type Resource,
  type Content,
} from "./knowledge-model";
import type { Source } from "./model";
import { useErrorSummary } from "./useErrorSummary";
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
const resources = ref<Resource[]>([
  {
    schema:
      props.source.dialect === "firebird"
        ? null
        : props.source.dialect === "postgres"
          ? "public"
          : props.source.dialect === "sybase"
            ? "DBA"
            : "dbo",
    name: "",
    type: "table",
  },
]);
const offset = ref(0),
  pages = ref<Inspection[]>([]),
  result = ref<Inspection>(),
  busy = ref(false),
  expired = ref(false);
const { error, errorSummary } = useErrorSummary();
const fingerprint = computed(() =>
  JSON.stringify({
    resources: resources.value,
    offset: offset.value,
    sourceId: props.source.id,
    version: props.source.authorizationVersion,
    active: props.source.active,
  }),
);
const scopeFingerprint = computed(() =>
  JSON.stringify({
    resources: resources.value,
    sourceId: props.source.id,
    version: props.source.authorizationVersion,
    active: props.source.active,
  }),
);
watch(scopeFingerprint, () => {
  pages.value = [];
  offset.value = 0;
});
const saved = ref(fingerprint.value);
let live = true,
  epoch = 0;
watch(fingerprint, () => {
  epoch++;
  result.value = undefined;
  expired.value = false;
  emit("result", undefined);
  emit("dirty", fingerprint.value !== saved.value);
});
const timer = window.setInterval(() => {
  pages.value = pages.value.filter((p) => Date.parse(p.expiresAt) > Date.now());
  if (result.value && Date.parse(result.value.expiresAt) <= Date.now()) {
    result.value = undefined;
    expired.value = true;
    emit("result", undefined);
  }
}, 1000);
onBeforeUnmount(() => {
  live = false;
  epoch++;
  window.clearInterval(timer);
  emit("dirty", false);
});
function usePublishedScope() {
  try {
    if (!props.content) return;
    resources.value = scopeForContent(props.content, props.source.dialect);
    offset.value = 0;
    error.value = "";
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "Revise o escopo.";
  }
}
async function inspect(nextOffset = 0) {
  if (busy.value || props.disabled || !props.source.active) return;
  busy.value = true;
  emit("lock", true);
  const scope = scopeFingerprint.value;
  const sourceBase = props.sourceBase;
  let version = epoch;
  try {
    error.value = "";
    if (nextOffset === 0) pages.value = [];
    result.value = undefined;
    emit("result", undefined);
    offset.value = nextOffset;
    await nextTick();
    if (!live || scope !== scopeFingerprint.value || sourceBase !== props.sourceBase) return;
    version = epoch;
    const input = schemaInspectionSchema.safeParse({
      resources: resources.value,
      offset: nextOffset,
      pageSize: 4,
    });
    if (!input.success)
      throw new Error("Informe de 1 a 16 tabelas ou views distintas, com nomes e schemas válidos.");
    const data = inspectionResultSchema.parse(
      await props.api<unknown>(`${sourceBase}/estrutura`, input.data),
    );
    if (!live || version !== epoch) return;
    if (data.sourceId !== props.source.id) throw new Error("Resposta de outra base descartada.");
    result.value = data;
    pages.value = [
      ...pages.value.filter((p) => p.evidence.metadataPage.offset !== nextOffset),
      data,
    ];
    saved.value = fingerprint.value;
    expired.value = false;
    emit("result", data);
    emit("dirty", false);
  } catch (cause) {
    if (live && version === epoch)
      error.value = cause instanceof Error ? cause.message : "Não foi possível inspecionar.";
  } finally {
    if (live) busy.value = false;
    emit("lock", false);
  }
}
async function compose() {
  if (busy.value || props.disabled || !props.source.active || pages.value.length < 2) return;
  error.value = "";
  const version = epoch;
  busy.value = true;
  emit("lock", true);
  try {
    const raw = await props.api<unknown>(`${props.sourceBase}/estrutura/compor`, {
      evidenceIds: pages.value.map((p) => p.id),
    });
    if (!live || version !== epoch) return;
    if (raw && typeof raw === "object" && "status" in raw && raw.status === "inconclusive") {
      throw new Error(
        "Páginas incompletas ou conflitantes. Inspecione novamente o escopo inteiro.",
      );
    }
    const data = inspectionResultSchema.parse(raw);
    if (data.sourceId !== props.source.id || !data.evidence.composition) {
      throw new Error("Composição de outra base ou sem origem descartada.");
    }
    result.value = data;
    expired.value = false;
    emit("result", data);
  } catch (cause) {
    if (live && version === epoch) {
      result.value = undefined;
      emit("result", undefined);
      error.value = cause instanceof Error ? cause.message : "Não foi possível combinar páginas.";
    }
  } finally {
    if (live) busy.value = false;
    emit("lock", false);
  }
}
const statusLabel: Record<string, string> = {
  available: "Disponível",
  unavailable: "Metadados indisponíveis",
  not_authorized: "Sem autorização técnica",
  not_found: "Não encontrado",
};
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
    <form aria-label="Escopo da inspeção" @submit.prevent="inspect(0)">
      <fieldset :disabled="disabled || busy || !source.active">
        <legend>Até 16 recursos; quatro por página</legend>
        <div v-for="(r, index) in resources" :key="index" class="knowledge-resource-row">
          <label v-if="source.dialect !== 'firebird'"
            >Schema {{ index + 1
            }}<input v-model="r.schema" required maxlength="128" pattern="[A-Za-z_][A-Za-z0-9_$]*"
          /></label>
          <label
            >Tabela ou view {{ index + 1
            }}<input v-model="r.name" required maxlength="128" pattern="[A-Za-z_][A-Za-z0-9_$]*"
          /></label>
          <label
            >Tipo {{ index + 1
            }}<select v-model="r.type">
              <option value="table">Tabela</option>
              <option value="view">View</option>
            </select></label
          >
          <button
            type="button"
            class="secondary"
            :disabled="resources.length === 1"
            :aria-label="`Remover recurso ${index + 1}`"
            @click="
              resources.splice(index, 1);
              offset = 0;
            "
          >
            Remover
          </button>
        </div>
        <button
          type="button"
          class="secondary"
          :disabled="resources.length >= 16"
          @click="
            resources.push({ schema: resources[0]?.schema ?? null, name: '', type: 'table' });
            offset = 0;
          "
        >
          Adicionar recurso
        </button>
        <button v-if="content" type="button" class="secondary" @click="usePublishedScope">
          Preencher escopo da versão selecionada
        </button>
        <button type="submit">Inspecionar estrutura</button>
      </fieldset>
    </form>
    <p v-if="busy" role="status">Inspecionando metadados autorizados…</p>
    <div v-if="pages.length > 1 && !result?.evidence.composition">
      <p>
        Páginas vigentes reunidas: {{ pages.length }}. Combinar não adota ou publica conhecimento.
      </p>
      <button type="button" :disabled="disabled || busy || !source.active" @click="compose">
        Combinar páginas inspecionadas
      </button>
    </div>
    <template v-if="result">
      <p role="status">
        Inspeção registrada. Leitura: {{ new Date(result.evidence.observedAt).toLocaleString() }}.
        Válida até {{ new Date(result.expiresAt).toLocaleTimeString() }}.
      </p>
      <p>Motor: {{ source.dialect }} · Base: {{ result.evidence.identity.database }}</p>
      <p v-if="result.evidence.composition" role="status">
        Evidência composta de {{ result.evidence.composition.pages.length }} páginas. A menor
        validade foi preservada; as leituras não representam um snapshot simultâneo.
      </p>
      <ul v-if="result.evidence.composition" aria-label="Origem das páginas">
        <li v-for="page in result.evidence.composition.pages" :key="page.id">
          Página em {{ page.offset }} · Leitura: {{ new Date(page.observedAt).toLocaleString() }}
        </li>
      </ul>
      <p v-else>
        Página
        {{ Math.floor(result.evidence.metadataPage.offset / 4) + 1 }}. As páginas são evidências
        separadas.
      </p>
      <article
        v-for="item in result.evidence.resources"
        :key="`${item.resource.schema}.${item.resource.name}`"
        class="knowledge-observation"
      >
        <h4>
          {{ item.resource.schema ? `${item.resource.schema}.` : "" }}{{ item.resource.name }} —
          {{ statusLabel[item.status] }}
        </h4>
        <p v-if="!item.coverage.columns" class="notice">
          Estrutura não comprovada. Confira o schema exato, o recurso e as permissões técnicas;
          metadados ausentes não provam que a tabela não existe.
        </p>
        <div
          v-if="item.columns.length"
          class="table-scroll"
          tabindex="0"
          :aria-label="`Campos de ${item.resource.name}`"
        >
          <table>
            <caption>
              Colunas observadas
            </caption>
            <thead>
              <tr>
                <th>Campo</th>
                <th>Tipo nativo</th>
                <th>Aceita nulo</th>
                <th>Tamanho/precisão</th>
                <th>Escala</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="column in item.columns" :key="column.name">
                <td>{{ column.name }}</td>
                <td>{{ column.nativeType }}</td>
                <td>
                  {{ column.nullable === null ? "Desconhecido" : column.nullable ? "Sim" : "Não" }}
                </td>
                <td>{{ column.size ?? "Não informado" }}</td>
                <td>{{ column.scale ?? "Não informada" }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <ul aria-label="Chaves observadas">
          <li v-for="key in item.primaryKeys" :key="`pk:${key.name}`">
            Primária {{ key.name }}: {{ key.columns.join(" → ") }} —
            {{ constraintLabels[key.status] }}
          </li>
          <li v-for="key in item.uniqueKeys ?? []" :key="`uk:${key.name}`">
            Única {{ key.name }}: {{ key.columns.join(" → ") }} — {{ constraintLabels[key.status] }}
          </li>
          <li v-for="key in item.foreignKeys" :key="`fk:${key.name}`">
            Relacionamento {{ key.name }}: {{ key.columns.join(", ") }} →
            {{ key.target.schema ? `${key.target.schema}.` : "" }}{{ key.target.name }} ({{
              key.targetColumns.join(", ")
            }}) — {{ constraintLabels[key.status] }}
          </li>
        </ul>
        <p
          v-if="
            !item.coverage.primaryKeys || !item.coverage.uniqueKeys || !item.coverage.foreignKeys
          "
          class="notice"
        >
          Cobertura de chaves incompleta: {{ !item.coverage.primaryKeys ? "primárias; " : ""
          }}{{ !item.coverage.uniqueKeys ? "unicidade; " : ""
          }}{{ !item.coverage.foreignKeys ? "relacionamentos; " : "" }}não foram integralmente
          comprovados. Lista vazia não comprova ausência.
        </p>
        <p v-if="item.limitations.includes('scoped_relationships')" class="notice">
          Relacionamentos são limitados aos recursos autorizados deste escopo. Objetos externos ao
          escopo não são expostos.
        </p>
        <p v-if="item.limitations.includes('metadata_unavailable')" class="notice">
          Há metadados indisponíveis. Revise permissões técnicas e cobertura antes de adotar esta
          estrutura.
        </p>
        <p v-if="!item.coverage.constraintStatus" class="notice">
          Constraints sem prova suficiente de enforcement. Elas não habilitam dependências
          executáveis.
        </p>
      </article>
      <button
        v-if="result.evidence.metadataPage.nextOffset !== null"
        type="button"
        :disabled="disabled || busy"
        @click="inspect(result!.evidence.metadataPage.nextOffset!)"
      >
        Inspecionar próxima página
      </button>
      <details>
        <summary>Identificadores da evidência</summary>
        <p>ID: {{ result.id }}</p>
        <p class="technical-value">Hash: {{ result.hash }}</p>
      </details>
    </template>
  </section>
</template>
