<script setup lang="ts">
import RelationshipDiagram from "./RelationshipDiagram.vue";
import {
  knowledgeGraphNodeName,
  knowledgeGraphTableNodes,
  knowledgeOriginLabel,
  knowledgeReviewStateLabel,
  type KnowledgeExplorerRun,
} from "./knowledge-explorer";
import { useKnowledgeGraph } from "./use-knowledge-graph";

const props = defineProps<{
  call: <T>(tool: string, args: unknown) => Promise<T>;
  run: KnowledgeExplorerRun;
  invalidate: () => void;
  failEpoch: number;
}>();
const emit = defineEmits<{
  status: [value: string];
}>();
const { selected, skills, graph, reviews, discover, readGraph, readReviews } = useKnowledgeGraph(
  props,
  emit,
);
</script>
<template>
  <button type="button" class="secondary" @click="discover">Carregar skills para o grafo</button>
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
    <li v-for="(review, index) in reviews.reviews" :key="index">
      {{ knowledgeOriginLabel(review.origin.kind) }} · {{ knowledgeReviewStateLabel(review.state)
      }}<span v-if="review.dueAt"> · {{ new Date(review.dueAt).toLocaleString() }}</span
      ><span v-if="review.task"> · {{ review.task }} (não suspende a execução)</span>
    </li>
  </ul>
  <article v-if="graph" aria-label="Grafo publicado autorizado">
    <p>{{ graph.guidance }}</p>
    <p v-if="!graph.page.complete" class="notice">
      Leitura parcial. Relacionamentos podem referenciar nós em páginas seguintes.
    </p>
    <p v-if="graph.omittedRelationships" class="notice">
      {{ graph.omittedRelationships }} relacionamento(s) não estão representados neste recorte. Não
      inferir caminhos ausentes.
    </p>
    <RelationshipDiagram
      v-if="graph.page.complete"
      :tables="knowledgeGraphTableNodes(graph)"
      :relationships="graph.edges"
    />
    <ul aria-label="Tabelas e campos do grafo">
      <li v-for="node in graph.nodes" :key="node.id">
        <strong>{{ knowledgeGraphNodeName(node) }}</strong
        >: {{ node.meaning }} — {{ knowledgeOriginLabel(node.origin.kind) }}
      </li>
    </ul>
    <button v-if="graph.page.nextCursor" type="button" class="secondary" @click="readGraph(true)">
      Carregar próxima página do grafo
    </button>
    <details>
      <summary>Proveniência da leitura</summary>
      <p class="technical-value">Publicação: {{ graph.publicationId }} · hash: {{ graph.hash }}</p>
    </details>
  </article>
</template>
