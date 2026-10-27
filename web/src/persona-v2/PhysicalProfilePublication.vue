<script setup lang="ts">
import KnowledgeContentSummary from "./KnowledgeContentSummary.vue";
import type { Inspection } from "./knowledge-model";
import type { Dialect } from "./model";
import type { PhysicalProfilePreview } from "./physical-profile-editor";

defineProps<{
  profileId: string;
  dirty: boolean;
  inspection?: Inspection;
  preview?: PhysicalProfilePreview;
  dialect: Dialect;
  disabled: boolean;
}>();
const reviewDate = defineModel<string>("reviewDate", { required: true });
const confirmed = defineModel<boolean>("confirmed", { required: true });
const emit = defineEmits<{
  review: [];
  publish: [];
}>();
</script>

<template>
  <label
    >Prazo de revisão da publicação<input
      v-model="reviewDate"
      type="datetime-local"
      :disabled="disabled"
  /></label>
  <button
    type="button"
    :disabled="disabled || dirty || !profileId || !inspection"
    @click="emit('review')"
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
      ><input v-model="confirmed" type="checkbox" :disabled="disabled" />Revisei as
      particularidades, os significados e as substituições desta base.</label
    >
    <button type="button" :disabled="disabled || dirty || !confirmed" @click="emit('publish')">
      Confirmar publicação do perfil físico
    </button>
  </section>
</template>
