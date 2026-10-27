<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import KnowledgeFeedbackForm from "./KnowledgeFeedbackForm.vue";
import KnowledgeGraphPanel from "./KnowledgeGraphPanel.vue";
import KnowledgeSearchPanel from "./KnowledgeSearchPanel.vue";
import { useErrorSummary } from "./useErrorSummary";
import {
  knowledgeExplorerErrorMessage,
  knowledgeFeedbackTarget,
  type KnowledgeSearchMatch,
} from "./knowledge-explorer";

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
}>();
const feedbackDirty = ref(false);
const busy = ref(false);
const failEpoch = ref(0);
const message = ref("");
const { error, errorSummary } = useErrorSummary();
let generation = 0;
let live = true;
function reset(): void {
  feedbackItem.value = undefined;
  feedbackDirty.value = false;
  emit("dirty", false);
  generation++;
  failEpoch.value++;
  error.value = "";
  message.value = "";
}
watch(() => [props.personaId, props.bearer], reset);
onBeforeUnmount(() => {
  live = false;
  reset();
});
function invalidate(): void {
  generation++;
}
async function run(action: (current: () => boolean) => Promise<void>): Promise<void> {
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
      failEpoch.value++;
      error.value = knowledgeExplorerErrorMessage(cause);
    }
  } finally {
    busy.value = false;
    emit("lock", false);
  }
}
async function chooseFeedback(
  match: KnowledgeSearchMatch,
  item: KnowledgeSearchMatch["items"][number],
): Promise<void> {
  if (feedbackDirty.value && !(await props.confirmDiscard())) {
    return;
  }
  feedbackItem.value = knowledgeFeedbackTarget(match, item);
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
      <KnowledgeSearchPanel
        :key="`search:${personaId}:${bearer}`"
        :call="call"
        :run="run"
        :invalidate="invalidate"
        :fail-epoch="failEpoch"
        @feedback="chooseFeedback"
        @status="message = $event"
      />
      <KnowledgeGraphPanel
        :key="`graph:${personaId}:${bearer}`"
        :call="call"
        :run="run"
        :invalidate="invalidate"
        :fail-epoch="failEpoch"
        @status="message = $event"
      />
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
