<script setup lang="ts">
import type { PublicationPreviewResult } from "../../../src/domain/persona-v2/catalog";
import type { ExternalPublicationPreview } from "../../../src/domain/persona-v2/external-run";
import PublicationReview from "./PublicationReview.vue";

defineProps<{
  legend: string;
  dateLabel: string;
  reviewAction: string;
  confirmLabel: string;
  publishAction: string;
  requiredApproved: boolean;
  preview: PublicationPreviewResult | ExternalPublicationPreview | undefined;
}>();
const reviewDate = defineModel<string>("reviewDate", { required: true });
const confirmed = defineModel<boolean>("confirmed", { required: true });
const emit = defineEmits<{ review: []; publish: [] }>();
</script>
<template>
  <fieldset>
    <legend>{{ legend }}</legend>
    <label>{{ dateLabel }}<input v-model="reviewDate" type="datetime-local" required /></label>
    <button :disabled="!reviewDate || !requiredApproved" @click="emit('review')">
      {{ reviewAction }}
    </button>
    <div v-if="preview">
      <PublicationReview :preview="preview" />
      <slot name="preview-meta" :preview="preview" />
      <p v-for="warning in preview.warnings" :key="warning">{{ warning }}</p>
      <label><input v-model="confirmed" type="checkbox" />{{ confirmLabel }}</label>
      <button :disabled="!confirmed" @click="emit('publish')">{{ publishAction }}</button>
    </div>
  </fieldset>
</template>
