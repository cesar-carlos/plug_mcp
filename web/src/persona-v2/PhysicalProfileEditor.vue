<script setup lang="ts">
import KnowledgeImpact from "./KnowledgeImpact.vue";
import PhysicalProfileComparison from "./PhysicalProfileComparison.vue";
import PhysicalProfileDraftList from "./PhysicalProfileDraftList.vue";
import PhysicalProfileForm from "./PhysicalProfileForm.vue";
import PhysicalProfilePublication from "./PhysicalProfilePublication.vue";
import PhysicalProfileSuspend from "./PhysicalProfileSuspend.vue";
import type { Inspection, KnowledgeSelection, ProfilePage } from "./knowledge-model";
import type { Dialect } from "./model";
import { usePhysicalProfile } from "./use-physical-profile";

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
const {
  editing,
  id,
  revision,
  name,
  content,
  overrides,
  reviewDate,
  dirty,
  preview,
  confirmed,
  suspendConfirmed,
  busy,
  message,
  error,
  errorSummary,
  start,
  save,
  review,
  publish,
  suspend,
} = usePhysicalProfile(props, emit);
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
    <PhysicalProfileDraftList
      :drafts="page.drafts"
      :next-cursor="page.nextDraftCursor"
      :disabled="disabled || busy"
      @create="start()"
      @edit="start"
      @more="emit('moreDrafts')"
    />
    <PhysicalProfileForm
      v-if="editing"
      v-model:name="name"
      v-model:content="content"
      v-model:overrides="overrides"
      :profile-id="id"
      :revision="revision"
      :tables="selection.standard.content.tables"
      :relationships="selection.standard.content.relationships"
      :dirty="dirty"
      :disabled="disabled || busy"
      @submit="save"
    />
    <PhysicalProfilePublication
      v-if="editing"
      v-model:review-date="reviewDate"
      v-model:confirmed="confirmed"
      :profile-id="id"
      :dirty="dirty"
      :inspection="inspection"
      :preview="preview"
      :dialect="dialect"
      :disabled="disabled || busy"
      @review="review"
      @publish="publish"
    />
    <KnowledgeImpact
      v-if="selection.profile"
      :root="`${sourceBase}/perfis`"
      :query="{ catalogId: selection.catalogId, publicationId: selection.profile.publicationId }"
      label="Impacto do perfil físico publicado"
      :api="api"
      :disabled="disabled || busy"
    />
    <PhysicalProfileSuspend
      v-if="selection.profile && !selection.profile.suspended"
      v-model:confirmed="suspendConfirmed"
      :profile="selection.profile"
      :disabled="disabled || busy"
      @suspend="suspend"
    />
  </section>
</template>
