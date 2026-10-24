<script setup lang="ts">
import { onMounted, ref, reactive, onBeforeUnmount } from "vue";
import type { HistoryItem, HistoryPage } from "../../../src/domain/persona-v2/console";
import { historyLabels } from "./history-labels";
import { useErrorSummary } from "./useErrorSummary";
const props = defineProps<{ api: <T>(url: string, body?: unknown) => Promise<T>; base: string }>();
const rows = ref<HistoryItem[]>([]),
  cursor = ref<HistoryPage["nextCursor"]>(null),
  busy = ref(false),
  loaded = ref(false);
const { error, errorSummary } = useErrorSummary();
const filter = reactive({ from: "", to: "", event: "", resourceId: "" });
let generation = 0;
onBeforeUnmount(() => generation++);
let applied: Record<string, string> = {};
const events = Object.keys(historyLabels);
async function load(more = false) {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  const version = ++generation;
  try {
    if (!more) {
      applied = Object.fromEntries(
        Object.entries(filter)
          .filter(([, v]) => v)
          .map(([k, v]) => [
            k,
            k === "from" ? `${v}T00:00:00.000Z` : k === "to" ? `${v}T23:59:59.999999Z` : v,
          ]),
      );
      rows.value = [];
      cursor.value = null;
      loaded.value = false;
    }
    const query = new URLSearchParams(applied);
    if (more && cursor.value) {
      query.set("afterAt", cursor.value.at);
      query.set("afterId", cursor.value.id);
    }
    const page = await props.api<HistoryPage>(`${props.base}/historico?${query}`);
    if (version !== generation) return;
    rows.value = more ? [...rows.value, ...page.items] : page.items.slice();
    cursor.value = page.nextCursor;
    loaded.value = true;
  } catch (cause) {
    if (version === generation)
      error.value = cause instanceof Error ? cause.message : "Histórico indisponível.";
  } finally {
    busy.value = false;
  }
}
onMounted(() => load());
</script>
<template>
  <section aria-label="Histórico administrativo" :aria-busy="busy">
    <h2>Histórico</h2>
    <p>
      Somente eventos registrados. Registros antigos podem não conter autor ou versão. O histórico
      não contém SQL, parâmetros, resultados ou credenciais.
    </p>
    <form @submit.prevent="load()">
      <fieldset :disabled="busy">
        <div class="row">
          <label>De (UTC)<input v-model="filter.from" type="date" /></label
          ><label>Até (UTC)<input v-model="filter.to" type="date" /></label>
        </div>
        <label
          >Evento<select v-model="filter.event">
            <option value="">Todos</option>
            <option v-for="event in events" :key="event" :value="event">
              {{ historyLabels[event] ?? event }}
            </option>
          </select></label
        >
        <label
          >Identificador do recurso<input
            v-model="filter.resourceId"
            placeholder="UUID do recurso"
            pattern="[a-fA-F0-9-]{36}"
        /></label>
        <button>Aplicar filtros</button>
      </fieldset>
    </form>
    <p v-if="error" ref="errorSummary" role="alert" tabindex="-1" class="error">{{ error }}</p>
    <p v-if="loaded && !rows.length">
      Nenhum evento registrado neste recorte. Isso não comprova ausência de atividade.
    </p>
    <ol>
      <li v-for="item in rows" :key="item.id" class="relationship">
        <strong>{{ historyLabels[item.event] ?? item.event }}</strong> ·
        {{ new Date(item.at).toLocaleString("pt-BR", { timeZoneName: "short" }) }} ·
        {{ item.success ? "Registrado com sucesso" : "Resultado não confirmado" }}
        <p>
          {{
            item.actor.kind === "responsavel"
              ? "Responsável"
              : item.actor.kind === "token"
                ? "Token consumidor"
                : "Autor não registrado"
          }}<span v-if="item.actor.id">: {{ item.actor.id }}</span>
        </p>
        <p>
          Recurso: {{ item.resourceId
          }}<span v-if="item.version">
            · Versão {{ item.previousVersion ? `${item.previousVersion} → ` : ""
            }}{{ item.version }}</span
          >
        </p>
        <details>
          <summary>Identificação técnica</summary>
          <p>{{ item.event }} · {{ item.origin }} · {{ item.id }}</p>
        </details>
      </li>
    </ol>
    <button v-if="cursor" type="button" :disabled="busy" @click="load(true)">
      Carregar mais eventos
    </button>
  </section>
</template>
