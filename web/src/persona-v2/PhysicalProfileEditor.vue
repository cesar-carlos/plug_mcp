<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { z } from "zod";
import StructureEditor from "./StructureEditor.vue";
import KnowledgeContentSummary from "./KnowledgeContentSummary.vue";
import PhysicalProfileComparison from "./PhysicalProfileComparison.vue";
import KnowledgeImpact from "./KnowledgeImpact.vue";
import type { Dialect } from "./model";
import {
  physicalProfileSchema,
  physicalProfilePublicationSchema,
} from "../../../src/domain/persona-v2/physical-profile";
import {
  type Profile,
  type ProfilePage,
  type KnowledgeSelection,
  type Inspection,
} from "./knowledge-model";
import { useErrorSummary } from "./useErrorSummary";
import { publicationDeadline } from "./publication-deadline";
const props = defineProps<{
  selection: KnowledgeSelection;
  page: ProfilePage;
  inspection?: Inspection;
  sourceBase: string;
  dialect: Dialect;
  api: <T>(url: string, body?: unknown) => Promise<T>;
  disabled: boolean;
  confirmDiscard: () => Promise<boolean>;
}>();
const emit = defineEmits<{
  dirty: [value: boolean];
  lock: [value: boolean];
  saved: [];
  moreDrafts: [];
}>();
const editing = ref(false),
  id = ref(""),
  revision = ref(0),
  name = ref(""),
  content = ref<unknown>();
const overrides = ref<{ tables: string[]; relationships: string[] }>({
  tables: [],
  relationships: [],
});
const fingerprint = computed(() =>
  JSON.stringify({ name: name.value, content: content.value, overrides: overrides.value }),
);
const saved = ref("");
const reviewDate = ref("");
const dirty = computed(() => editing.value && fingerprint.value !== saved.value);
const preview = ref<{
  profile: Profile;
  hash: string;
  confirmationHash: string;
  expiresAt: string;
  reviewDueAt: string;
}>();
const confirmed = ref(false),
  suspendConfirmed = ref(false),
  busy = ref(false),
  message = ref(""),
  now = ref(Date.now());
const { error, errorSummary } = useErrorSummary();
let live = true;
let refreshAfterSave = false;
watch(
  () => dirty.value || suspendConfirmed.value || !!reviewDate.value,
  (value) => emit("dirty", value),
  { immediate: true },
);
watch(fingerprint, () => {
  preview.value = undefined;
  confirmed.value = false;
});
watch(reviewDate, () => {
  preview.value = undefined;
  confirmed.value = false;
});
const timer = window.setInterval(() => {
  now.value = Date.now();
  if (preview.value && Date.parse(preview.value.expiresAt) <= now.value) {
    preview.value = undefined;
    confirmed.value = false;
    message.value = "A revisão expirou. Revise novamente antes de publicar.";
  }
}, 1000);
onBeforeUnmount(() => {
  live = false;
  window.clearInterval(timer);
  emit("dirty", false);
});
async function run(action: () => Promise<void>) {
  if (busy.value || props.disabled) return;
  busy.value = true;
  emit("lock", true);
  error.value = "";
  message.value = "";
  try {
    await action();
  } catch (cause) {
    if (live)
      error.value = cause instanceof Error ? cause.message : "Não foi possível concluir o perfil.";
  } finally {
    if (live) busy.value = false;
    emit("lock", false);
    await nextTick();
    if (live && refreshAfterSave) {
      refreshAfterSave = false;
      emit("saved");
    }
  }
}
async function start(draft?: Profile) {
  if ((dirty.value || reviewDate.value) && !(await props.confirmDiscard())) return;
  reviewDate.value = "";
  editing.value = true;
  id.value = draft?.id ?? "";
  revision.value = draft?.revision ?? 0;
  name.value = draft?.name ?? "";
  content.value = JSON.parse(
    JSON.stringify(
      draft?.content ?? props.selection.profile?.content ?? props.selection.standard.content,
    ),
  ) as unknown;
  overrides.value = draft
    ? { tables: [...draft.overrides.tables], relationships: [...draft.overrides.relationships] }
    : { tables: [], relationships: [] };
  preview.value = undefined;
  confirmed.value = false;
  saved.value = draft ? fingerprint.value : "";
}
async function save() {
  await run(async () => {
    if (new TextEncoder().encode(JSON.stringify(content.value)).byteLength > 51200)
      throw new Error("O perfil excede o limite de 50 KiB. Reduza o conteúdo antes de salvar.");
    const raw = await props.api<unknown>(`${props.sourceBase}/perfis/salvar`, {
      catalogId: props.selection.catalogId,
      basePublicationId: props.selection.standard.id,
      name: name.value,
      content: content.value,
      overrides: overrides.value,
      ...(id.value ? { id: id.value, expectedRevision: revision.value } : {}),
    });
    const data = z.object({ profile: physicalProfileSchema }).parse(raw);
    if (!live) return;
    id.value = data.profile.id;
    revision.value = data.profile.revision;
    saved.value = fingerprint.value;
    preview.value = undefined;
    message.value = "Rascunho físico salvo. Revise a mesma evidência antes de publicar.";
    refreshAfterSave = true;
  });
}
async function review() {
  await run(async () => {
    if (!props.inspection) throw new Error("Inspecione a estrutura da base antes de revisar.");
    const data = z
      .object({
        profile: physicalProfileSchema,
        hash: z.string(),
        confirmationHash: z.string(),
        expiresAt: z.iso.datetime({ offset: true }),
        reviewDueAt: z.iso.datetime(),
      })
      .parse(
        await props.api<unknown>(`${props.sourceBase}/perfis/preview`, {
          catalogId: props.selection.catalogId,
          profileId: id.value,
          evidenceId: props.inspection.id,
          reviewDueAt: publicationDeadline(reviewDate.value),
        }),
      );
    if (live) {
      preview.value = data;
      confirmed.value = false;
    }
  });
}
async function publish() {
  if (!preview.value || !confirmed.value) return;
  const current = preview.value;
  await run(async () => {
    if (!props.inspection)
      throw new Error("A evidência não está mais disponível. Inspecione novamente.");
    physicalProfilePublicationSchema.parse(
      await props.api<unknown>(`${props.sourceBase}/perfis/publicar`, {
        catalogId: props.selection.catalogId,
        profileId: id.value,
        evidenceId: props.inspection.id,
        confirmationHash: current.confirmationHash,
      }),
    );
    if (!live) return;
    preview.value = undefined;
    confirmed.value = false;
    message.value =
      "Perfil publicado. Selecione a versão explicitamente no treinamento; nenhuma skill foi atualizada.";
    reviewDate.value = "";
    refreshAfterSave = true;
  });
}
async function suspend() {
  if (!props.selection.profile || !suspendConfirmed.value) return;
  await run(async () => {
    await props.api(`${props.sourceBase}/perfis/suspender`, {
      catalogId: props.selection.catalogId,
      publicationId: props.selection.profile!.publicationId,
    });
    if (!live) return;
    suspendConfirmed.value = false;
    message.value = "Versão física suspensa. As dependências ficam bloqueadas.";
    refreshAfterSave = true;
  });
}
watch(
  () => props.inspection?.id,
  () => {
    preview.value = undefined;
    confirmed.value = false;
  },
);
</script>
<template>
  <section aria-label="Editor de perfil físico">
    <h3>Particularidades desta base</h3>
    <p>
      O perfil compõe o padrão com particularidades revisadas desta instalação. Publicar exige
      curador com acesso vigente à mesma base e não altera skills existentes.
    </p>
    <p v-if="error" ref="errorSummary" role="alert" tabindex="-1" class="error">{{ error }}</p>
    <p v-if="message" role="status">{{ message }}</p>
    <PhysicalProfileComparison
      :publications="page.publications"
      :catalog-id="selection.catalogId"
      :source-base="sourceBase"
      :disabled="disabled || busy"
      :api="api"
    />
    <fieldset :disabled="disabled || busy">
      <legend>Rascunhos desta base e padrão</legend>
      <button type="button" @click="start()">Criar perfil físico</button>
      <ul>
        <li v-for="draft in page.drafts" :key="draft.id">
          <button type="button" class="secondary" @click="start(draft)">
            Editar {{ draft.name }} · revisão {{ draft.revision }}
          </button>
        </li>
      </ul>
      <button
        v-if="page.nextDraftCursor"
        type="button"
        class="secondary"
        @click="emit('moreDrafts')"
      >
        Carregar mais rascunhos físicos
      </button>
    </fieldset>
    <form v-if="editing" aria-label="Editar perfil físico" @submit.prevent="save">
      <fieldset :disabled="disabled || busy">
        <legend>{{ id ? `Edição da revisão ${revision}` : "Novo rascunho físico" }}</legend>
        <label>Nome do perfil físico<input v-model="name" required maxlength="200" /></label>
        <StructureEditor v-model="content" />
        <fieldset>
          <legend>Substituições explícitas do padrão</legend>
          <p>
            Marque apenas as definições comuns que foram alteradas e revisadas. Campos comuns,
            classificação e restrições não podem ser reduzidos.
          </p>
          <label v-for="table in selection.standard.content.tables" :key="table.id" class="check"
            ><input v-model="overrides.tables" type="checkbox" :value="table.id" />Substituir
            definição de {{ table.name }}</label
          >
          <label
            v-for="relation in selection.standard.content.relationships"
            :key="relation.id"
            class="check"
            ><input
              v-model="overrides.relationships"
              type="checkbox"
              :value="relation.id"
            />Substituir relacionamento: {{ relation.meaning }}</label
          >
        </fieldset>
        <p v-if="dirty">Há alterações não salvas no perfil físico.</p>
        <button type="submit">Salvar perfil físico</button>
      </fieldset>
    </form>
    <template v-if="editing">
      <label
        >Prazo de revisão da publicação<input
          v-model="reviewDate"
          type="datetime-local"
          :disabled="disabled || busy"
      /></label>
      <button
        type="button"
        :disabled="disabled || busy || dirty || !id || !inspection"
        @click="review"
      >
        Revisar perfil para publicação
      </button>
      <p v-if="!inspection" class="notice">Inspecione a estrutura antes de revisar a publicação.</p>
      <section v-if="preview" aria-label="Revisão do perfil físico">
        <h4>{{ preview.profile.name }} · revisão {{ preview.profile.revision }}</h4>
        <p>Próxima revisão: {{ new Date(preview.reviewDueAt).toLocaleString() }}</p>
        <p>
          Revisão técnica compatível com a evidência atual. Confirmação válida até
          {{ new Date(preview.expiresAt).toLocaleTimeString() }}.
        </p>
        <KnowledgeContentSummary :content="preview.profile.content" :dialect="dialect" />
        <details>
          <summary>Conteúdo exato desta publicação</summary>
          <pre>{{ JSON.stringify(preview.profile, null, 2) }}</pre>
          <p class="technical-value">Hash: {{ preview.hash }}</p>
        </details>
        <label class="check"
          ><input v-model="confirmed" type="checkbox" :disabled="disabled || busy" />Revisei as
          particularidades, os significados e as substituições desta base.</label
        >
        <button type="button" :disabled="disabled || busy || dirty || !confirmed" @click="publish">
          Confirmar publicação do perfil físico
        </button>
      </section>
    </template>
    <KnowledgeImpact
      v-if="selection.profile"
      :root="`${sourceBase}/perfis`"
      :query="{ catalogId: selection.catalogId, publicationId: selection.profile.publicationId }"
      label="Impacto do perfil físico publicado"
      :api="api"
      :disabled="disabled || busy"
    />
    <fieldset v-if="selection.profile && !selection.profile.suspended" :disabled="disabled || busy">
      <legend>Suspender versão selecionada</legend>
      <p>{{ selection.profile.name }} · revisão {{ selection.profile.revision }}</p>
      <label class="check"
        ><input v-model="suspendConfirmed" type="checkbox" />Confirmo a suspensão desta versão e o
        bloqueio das skills dependentes.</label
      ><button type="button" class="danger" :disabled="!suspendConfirmed" @click="suspend">
        Suspender perfil publicado
      </button>
    </fieldset>
  </section>
</template>
