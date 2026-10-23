<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from "vue";
import type { KnowledgeFeedback } from "../../../src/domain/persona-v2/knowledge-maintenance";
import KnowledgeReviewCalendar from "./KnowledgeReviewCalendar.vue";
import { useErrorSummary } from "./useErrorSummary";
const props = defineProps<{
  personaBase: string;
  drafts: { id: string; name: string; activePublicationId: string | null }[];
  api: <T>(url: string, body?: unknown) => Promise<T>;
  disabled: boolean;
  confirmDiscard: () => Promise<boolean>;
}>();
const emit = defineEmits<{ dirty: [boolean]; lock: [boolean] }>();
const items = ref<KnowledgeFeedback[]>([]),
  cursor = ref<string | null>(null),
  selected = ref<KnowledgeFeedback>(),
  reason = ref(""),
  proposalId = ref(""),
  busy = ref(false),
  calendarDirty = ref(false),
  skillId = ref("");
const { error, errorSummary } = useErrorSummary();
let live = true;
const dirty = computed(() => !!reason.value || !!proposalId.value || calendarDirty.value);
watch(dirty, (v) => emit("dirty", v), { immediate: true });
onBeforeUnmount(() => {
  live = false;
  emit("dirty", false);
});
const skill = computed(() => props.drafts.find((d) => d.id === skillId.value));
async function run(fn: () => Promise<void>) {
  if (busy.value || props.disabled) {
    return;
  }
  busy.value = true;
  emit("lock", true);
  error.value = "";
  try {
    await fn();
  } catch (e) {
    if (live) {
      error.value = e instanceof Error ? e.message : "Feedback indisponível.";
    }
  } finally {
    busy.value = false;
    emit("lock", false);
  }
}
async function load(append = false) {
  await run(async () => {
    const data = await props.api<{ items: KnowledgeFeedback[]; nextCursor: string | null }>(
      `${props.personaBase}/feedback-conhecimento${append && cursor.value ? `?beforeId=${cursor.value}` : ""}`,
    );
    if (live) {
      items.value = append ? [...items.value, ...data.items] : data.items;
      cursor.value = data.nextCursor;
    }
  });
}
async function choose(f: KnowledgeFeedback) {
  if ((reason.value || proposalId.value) && !(await props.confirmDiscard())) {
    return;
  }
  selected.value = f;
  reason.value = "";
  proposalId.value = "";
}
async function chooseSkill(e: Event) {
  const input = e.target as HTMLSelectElement;
  if (calendarDirty.value && !(await props.confirmDiscard())) {
    input.value = skillId.value;
    return;
  }
  skillId.value = input.value;
  calendarDirty.value = false;
}
async function decide() {
  if (!selected.value) {
    return;
  }
  await run(async () => {
    const f = selected.value!;
    await props.api(`${props.personaBase}/feedback-conhecimento/${f.id}/decidir`, {
      expectedVersion: f.version,
      reason: reason.value,
      proposal: proposalId.value ? { id: proposalId.value, kind: f.origin.kind } : null,
    });
    if (live) {
      selected.value = undefined;
      reason.value = "";
      proposalId.value = "";
      const data = await props.api<{ items: KnowledgeFeedback[]; nextCursor: string | null }>(
        `${props.personaBase}/feedback-conhecimento`,
      );
      if (live) {
        items.value = data.items;
        cursor.value = data.nextCursor;
      }
    }
  });
}
</script>
<template>
  <section aria-label="Feedback e revisão do conhecimento">
    <h2>Feedback e revisão</h2>
    <p>
      Somente feedback explícito é registrado. Ausência de itens não prova ausência de atividade.
    </p>
    <p v-if="error" ref="errorSummary" class="error" role="alert" tabindex="-1">{{ error }}</p>
    <fieldset :disabled="disabled || busy">
      <button type="button" @click="load()">Carregar feedback da persona</button>
      <ul>
        <li v-for="f in items" :key="f.id">
          <button type="button" class="secondary" @click="choose(f)">
            {{ f.type }} · {{ f.state }} · {{ new Date(f.createdAt).toLocaleString() }}
          </button>
        </li>
      </ul>
      <button v-if="cursor" type="button" @click="load(true)">Carregar feedback anterior</button>
      <article v-if="selected">
        <h4>Feedback {{ selected.type }}</h4>
        <p>{{ selected.content }}</p>
        <p>Item {{ selected.itemId }} · origem {{ selected.origin.kind }}</p>
        <details>
          <summary>Proveniência</summary>
          <p class="technical-value">
            Publicação {{ selected.publicationId }} · {{ selected.publicationHash }} · autor
            {{ selected.tokenId }} · {{ selected.hash }}
          </p>
        </details>
        <p v-if="selected.state !== 'aberto'">{{ selected.reason }}</p>
        <form v-else aria-label="Tratar feedback de conhecimento" @submit.prevent="decide">
          <p>
            Encerrar não corrige o treinamento. Para encaminhar, cadastre primeiro uma proposta
            explícita na mesma publicação de origem.
          </p>
          <label v-if="selected.origin.kind !== 'privado'"
            >ID da proposta existente (opcional)<input
              v-model="proposalId"
              pattern="[a-fA-F0-9-]{36}" /></label
          ><label
            >Justificativa do feedback<textarea v-model="reason" maxlength="2000" required /></label
          ><button>{{ proposalId ? "Vincular à proposta" : "Encerrar feedback" }}</button>
        </form>
      </article>
      <label
        >Skill publicada para revisão<select :value="skillId" @change="chooseSkill">
          <option value="">Selecione</option>
          <option
            v-for="d in drafts.filter((d) => d.activePublicationId)"
            :key="d.id"
            :value="d.id"
          >
            {{ d.name }}
          </option>
        </select></label
      >
    </fieldset>
    <KnowledgeReviewCalendar
      v-if="skill?.activePublicationId"
      :key="`${skill.id}:${skill.activePublicationId}`"
      :root="`${personaBase}/skills/${skill.id}/publicacoes/${skill.activePublicationId}/revisao`"
      :api="api"
      :disabled="disabled || busy"
      :confirm-discard="confirmDiscard"
      @dirty="calendarDirty = $event"
      @lock="emit('lock', $event)"
    />
  </section>
</template>
