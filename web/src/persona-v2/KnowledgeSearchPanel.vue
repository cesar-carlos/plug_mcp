<script setup lang="ts">
import {
  knowledgeKindLabel,
  knowledgeOriginLabel,
  type KnowledgeExplorerRun,
  type KnowledgeSearchMatch,
} from "./knowledge-explorer";
import { useKnowledgeSearch } from "./use-knowledge-search";

const props = defineProps<{
  call: <T>(tool: string, args: unknown) => Promise<T>;
  run: KnowledgeExplorerRun;
  invalidate: () => void;
  failEpoch: number;
}>();
const emit = defineEmits<{
  feedback: [match: KnowledgeSearchMatch, item: KnowledgeSearchMatch["items"][number]];
  status: [value: string];
}>();
const { question, matches, search } = useKnowledgeSearch(props, emit);
</script>
<template>
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
          {{ knowledgeKindLabel(item.kind) }}: {{ item.label }} —
          {{ knowledgeOriginLabel(item.origin.kind)
          }}<span v-if="item.table">
            · {{ item.table }}<span v-if="item.column">.{{ item.column }}</span></span
          >
          <button type="button" class="secondary" @click="emit('feedback', match, item)">
            Registrar feedback sobre este item
          </button>
        </li>
      </ul>
      <p v-if="!match.itemsComplete">
        Há outros itens nesta skill. Refine a busca ou leia o grafo.
      </p>
    </li>
  </ul>
</template>
