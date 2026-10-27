<script setup lang="ts">
import ConfirmationDialog from "./ConfirmationDialog.vue";
import KnowledgeImpact from "./KnowledgeImpact.vue";
import KnowledgeReviewCalendar from "./KnowledgeReviewCalendar.vue";
import { catalogChangeLabels } from "./catalog-labels";
import type { CatalogComparison, CatalogPublication } from "./catalog-panel";
import { useConfirmation } from "./useConfirmation";

defineProps<{
  versions: CatalogPublication[];
  nextCursor: string | null;
  beforeId: string;
  afterId: string;
  comparison: CatalogComparison | undefined;
  mayPublish: boolean;
  catalogRoot: string;
  api: <T>(url: string, body?: unknown) => Promise<T>;
  disabled: boolean;
  confirmDiscard: () => Promise<boolean>;
}>();
const emit = defineEmits<{
  "update:beforeId": [value: string];
  "update:afterId": [value: string];
  loadMore: [];
  compare: [];
  suspend: [publication: CatalogPublication];
  reviewDirty: [id: string, value: boolean];
  lock: [value: boolean];
}>();
const { confirmation, ask, answer } = useConfirmation();
async function suspend(publication: CatalogPublication): Promise<void> {
  if (
    !(await ask({
      title: "Suspender esta versão compartilhada?",
      description: "Ela ficará indisponível para leitores. O conteúdo publicado será preservado.",
      confirmLabel: "Suspender versão",
    }))
  ) {
    return;
  }
  emit("suspend", publication);
}
</script>

<template>
  <section aria-label="Versões do padrão">
    <ConfirmationDialog v-if="confirmation" v-bind="confirmation" @answer="answer" />
    <h3>Versões publicadas</h3>
    <p>Comparar versões não altera fontes nem skills. Suspensão preserva o histórico.</p>
    <article v-for="v in versions" :key="v.id">
      <p>Revisão {{ v.revision }} · {{ v.suspendedAt ? "Suspensa" : "Disponível" }}</p>
      <KnowledgeImpact
        :root="`${catalogRoot}/publicacoes/${v.id}`"
        :api="api"
        :disabled="disabled"
      />
      <details>
        <summary>Conteúdo da revisão {{ v.revision }}</summary>
        <pre>{{ JSON.stringify(v.content, null, 2) }}</pre>
      </details>
      <button v-if="mayPublish" type="button" :disabled="!!v.suspendedAt" @click="suspend(v)">
        Suspender revisão {{ v.revision }}
      </button>
      <KnowledgeReviewCalendar
        v-if="mayPublish && !v.suspendedAt"
        :root="`${catalogRoot}/publicacoes/${v.id}/revisao`"
        :api="api"
        :disabled="disabled"
        :confirm-discard="confirmDiscard"
        @dirty="emit('reviewDirty', v.id, $event)"
        @lock="emit('lock', $event)"
      />
    </article>
    <button v-if="nextCursor" type="button" @click="emit('loadMore')">
      Carregar versões anteriores
    </button>
    <form aria-label="Comparar versões do padrão" @submit.prevent="emit('compare')">
      <label
        >Versão de origem<select
          :value="beforeId"
          required
          @change="emit('update:beforeId', ($event.target as HTMLSelectElement).value)"
        >
          <option value="">Selecione</option>
          <option v-for="v in versions" :key="v.id" :value="v.id">
            Revisão {{ v.revision }} · {{ v.id }}
          </option>
        </select></label
      >
      <label
        >Versão de destino<select
          :value="afterId"
          required
          @change="emit('update:afterId', ($event.target as HTMLSelectElement).value)"
        >
          <option value="">Selecione</option>
          <option v-for="v in versions" :key="v.id" :value="v.id">
            Revisão {{ v.revision }} · {{ v.id }}
          </option>
        </select></label
      >
      <button :disabled="!beforeId || !afterId">Comparar versões</button>
    </form>
    <div v-if="comparison" role="status">
      <p v-if="!comparison.changes.length">Nenhuma alteração no conteúdo.</p>
      <ul v-else>
        <li v-for="c in comparison.changes" :key="c.path">
          {{ catalogChangeLabels[c.kind] }}: {{ c.path }}
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
section,
form {
  display: grid;
  gap: 0.75rem;
}
label {
  display: grid;
  gap: 0.3rem;
}
pre {
  max-height: 24rem;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
input,
select,
button {
  max-width: 100%;
}
</style>
