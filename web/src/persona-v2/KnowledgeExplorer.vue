<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import type {
  KnowledgeGraph,
  KnowledgeDocument,
} from "../../../src/domain/persona-v2/knowledge-context";
import RelationshipDiagram from "./RelationshipDiagram.vue";
import KnowledgeFeedbackForm from "./KnowledgeFeedbackForm.vue";
import { useErrorSummary } from "./useErrorSummary";
const props = defineProps<{
  personaId: string;
  bearer: string;
  call: <T>(tool: string, args: unknown) => Promise<T>;
  disabled: boolean;
  confirmDiscard: () => Promise<boolean>;
}>();
const emit = defineEmits<{ lock: [value: boolean]; dirty: [boolean] }>();
const feedbackItem = ref<{
    skillId: string;
    publicationId: string;
    itemId: string;
    label: string;
  }>(),
  feedbackDirty = ref(false);
const reviews = ref<{
  reviews: { origin: { kind: string }; state: string; dueAt: string | null; task: string }[];
}>();
async function chooseFeedback(match: SearchMatch, item: SearchMatch["items"][number]) {
  if (feedbackDirty.value && !(await props.confirmDiscard())) return;
  feedbackItem.value = {
    skillId: match.skillId,
    publicationId: match.publicationId,
    itemId: item.id,
    label: item.label,
  };
}
interface SearchMatch {
  skillId: string;
  name: string;
  slug: string;
  publicationId: string;
  items: (Omit<KnowledgeDocument, "text"> & { matchedTerms: string[] })[];
  itemsComplete: boolean;
}
interface GraphPage extends KnowledgeGraph {
  publicationId: string;
  hash: string;
  page: { nextCursor: string | null; complete: boolean };
  guidance: string;
}
const question = ref(""),
  selected = ref(""),
  skills = ref<{ id: string; name: string; kind: string }[]>([]),
  matches = ref<SearchMatch[]>([]);
const graph = ref<GraphPage>(),
  busy = ref(false),
  message = ref("");
const { error, errorSummary } = useErrorSummary();
let generation = 0,
  live = true;
const originNames: Record<string, string> = {
  privado: "Treinamento privado",
  padrao: "Padrão compartilhado",
  perfil: "Particularidade da base",
};
const kindNames: Record<string, string> = {
  skill: "Finalidade",
  table: "Tabela",
  column: "Campo",
  relationship: "Relacionamento",
  rule: "Regra",
  example: "Exemplo aprovado",
  parameter: "Parâmetro",
};
const tableNodes = computed(
  () =>
    graph.value?.nodes
      .filter((n) => n.kind === "table")
      .map((n) => ({ id: n.id, name: `${n.schema ? n.schema + "." : ""}${n.table}` })) ?? [],
);
function reset() {
  feedbackItem.value = undefined;
  feedbackDirty.value = false;
  emit("dirty", false);
  reviews.value = undefined;
  generation++;
  skills.value = [];
  matches.value = [];
  graph.value = undefined;
  selected.value = "";
  question.value = "";
  error.value = "";
  message.value = "";
}
watch(() => [props.personaId, props.bearer], reset);
watch(question, () => {
  generation++;
  matches.value = [];
});
watch(selected, () => {
  reviews.value = undefined;
  generation++;
  graph.value = undefined;
});
onBeforeUnmount(() => {
  live = false;
  reset();
});
async function run(action: (current: () => boolean) => Promise<void>) {
  if (busy.value || props.disabled || !props.bearer) {
    return;
  }
  const version = ++generation;
  busy.value = true;
  emit("lock", true);
  error.value = "";
  message.value = "";
  const current = () => live && generation === version;
  try {
    const context = await props.call<{ id: string }>("obter_contexto_persona", {});
    if (!current()) {
      return;
    }
    if (context.id !== props.personaId) {
      throw new Error("Este token pertence a outra persona.");
    }
    await action(current);
  } catch (cause) {
    if (current()) {
      graph.value = undefined;
      matches.value = [];
      error.value = cause instanceof Error ? cause.message : "Conhecimento indisponível.";
    }
  } finally {
    busy.value = false;
    emit("lock", false);
  }
}
async function discover() {
  await run(async (current) => {
    const data = await props.call<typeof skills.value>("listar_skills", {});
    if (current()) {
      skills.value = data;
      message.value = "Publicações concedidas ao consumidor. Nenhum SQL executado.";
    }
  });
}
async function readReviews() {
  await run(async (current) => {
    const data = await props.call<NonNullable<typeof reviews.value>>(
      "obter_revisoes_conhecimento",
      { skillId: selected.value },
    );
    if (current()) reviews.value = data;
  });
}
async function search() {
  matches.value = [];
  await run(async (current) => {
    const data = await props.call<{ matches: SearchMatch[]; complete: boolean }>(
      "buscar_contexto",
      { pergunta: question.value },
    );
    if (current()) {
      matches.value = data.matches;
      message.value = data.matches.length
        ? data.complete
          ? "Correspondências no conhecimento publicado. Leia a skill antes de consultar."
          : "Primeiras vinte correspondências. Refine os termos para encontrar outros itens."
        : "Nenhuma correspondência lexical. Isso não prova ausência de dados ou capacidade.";
    }
  });
}
async function readGraph(append = false) {
  const previous = graph.value;
  if (!append) {
    graph.value = undefined;
  }
  await run(async (current) => {
    const data = await props.call<GraphPage>("obter_grafo_conhecimento", {
      skillId: selected.value,
      pageSize: 50,
      ...(append && previous?.page.nextCursor ? { cursor: previous.page.nextCursor } : {}),
    });
    if (!current()) {
      return;
    }
    if (
      append &&
      previous &&
      (previous.publicationId !== data.publicationId || previous.hash !== data.hash)
    ) {
      throw new Error("Publicação mudou; reinicie a leitura.");
    }
    graph.value =
      append && previous
        ? {
            ...data,
            nodes: [...previous.nodes, ...data.nodes],
            edges: [...previous.edges, ...data.edges],
          }
        : data;
  });
}
</script>
<template>
  <section aria-label="Explorar conhecimento autorizado">
    <h2>Conhecimento disponível ao consumidor</h2>
    <p>
      Use o token informado em Tokens e conexões. Busca e grafo mostram publicações concedidas; não
      executam SQL nem ampliam permissões.
    </p>
    <p v-if="!bearer" class="notice">Informe um token da persona em Tokens e conexões.</p>
    <p v-if="error" ref="errorSummary" class="error" role="alert" tabindex="-1">{{ error }}</p>
    <p v-if="message" role="status">{{ message }}</p>
    <fieldset :disabled="disabled || busy || !bearer">
      <form aria-label="Buscar conhecimento publicado" @submit.prevent="search">
        <label
          >Termos para encontrar conhecimento<input v-model="question" maxlength="2000" required
        /></label>
        <button>Buscar conhecimento</button>
      </form>
      <ul aria-label="Correspondências do conhecimento">
        <li v-for="match in matches" :key="match.publicationId">
          <strong>{{ match.name }}</strong> · {{ match.slug }}
          <ul>
            <li v-for="item in match.items" :key="item.id">
              {{ kindNames[item.kind] }}: {{ item.label }} — {{ originNames[item.origin.kind]
              }}<span v-if="item.table">
                · {{ item.table }}<span v-if="item.column">.{{ item.column }}</span></span
              >
              <button type="button" class="secondary" @click="chooseFeedback(match, item)">
                Registrar feedback sobre este item
              </button>
            </li>
          </ul>
          <p v-if="!match.itemsComplete">
            Há outros itens nesta skill. Refine a busca ou leia o grafo.
          </p>
        </li>
      </ul>
      <button type="button" class="secondary" @click="discover">
        Carregar skills para o grafo
      </button>
      <label
        >Skill para o grafo<select v-model="selected">
          <option value="">Selecione uma publicação concedida</option>
          <option v-for="skill in skills" :key="skill.id" :value="skill.id">
            {{ skill.name }}
          </option>
        </select></label
      >
      <button type="button" :disabled="!selected" @click="readGraph()">Ler grafo publicado</button>
      <button type="button" :disabled="!selected" @click="readReviews()">
        Verificar prazos de revisão
      </button>
      <ul v-if="reviews" aria-label="Avisos de revisão concedidos">
        <li v-for="(r, index) in reviews.reviews" :key="index">
          {{ originNames[r.origin.kind] }} ·
          {{
            r.state === "nao_configurada"
              ? "Revisão não configurada"
              : r.state === "vencida"
                ? "Revisão vencida"
                : "Revisão em dia"
          }}<span v-if="r.dueAt"> · {{ new Date(r.dueAt).toLocaleString() }}</span
          ><span v-if="r.task"> · {{ r.task }} (não suspende a execução)</span>
        </li>
      </ul>
      <article v-if="graph" aria-label="Grafo publicado autorizado">
        <p>{{ graph.guidance }}</p>
        <p v-if="!graph.page.complete" class="notice">
          Leitura parcial. Relacionamentos podem referenciar nós em páginas seguintes.
        </p>
        <p v-if="graph.omittedRelationships" class="notice">
          {{ graph.omittedRelationships }} relacionamento(s) não estão representados neste recorte.
          Não inferir caminhos ausentes.
        </p>
        <RelationshipDiagram
          v-if="graph.page.complete"
          :tables="tableNodes"
          :relationships="graph.edges"
        />
        <ul aria-label="Tabelas e campos do grafo">
          <li v-for="node in graph.nodes" :key="node.id">
            <strong
              >{{ node.schema ? node.schema + "." : "" }}{{ node.table
              }}{{ node.column ? "." + node.column : "" }}</strong
            >: {{ node.meaning }} — {{ originNames[node.origin.kind] }}
          </li>
        </ul>
        <button
          v-if="graph.page.nextCursor"
          type="button"
          class="secondary"
          @click="readGraph(true)"
        >
          Carregar próxima página do grafo
        </button>
        <details>
          <summary>Proveniência da leitura</summary>
          <p class="technical-value">
            Publicação: {{ graph.publicationId }} · hash: {{ graph.hash }}
          </p>
        </details>
      </article>
    </fieldset>
    <KnowledgeFeedbackForm
      v-if="feedbackItem"
      :key="`${feedbackItem.publicationId}:${feedbackItem.itemId}`"
      :persona-id="personaId"
      :item="feedbackItem"
      :call="call"
      :disabled="disabled || busy"
      @lock="emit('lock', $event)"
      @dirty="
        feedbackDirty = $event;
        emit('dirty', $event);
      "
    />
  </section>
</template>
