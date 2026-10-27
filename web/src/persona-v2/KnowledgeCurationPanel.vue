<script setup lang="ts">
import CurationProposalDetail from "./CurationProposalDetail.vue";
import CurationProposalForm from "./CurationProposalForm.vue";
import CurationProposalList from "./CurationProposalList.vue";
import type { ProfilePublication } from "./knowledge-model";
import { useCurationPanel } from "./use-curation-panel";

const props = defineProps<{
  catalogId: string;
  role: string;
  patterns: { id: string; name: string; activePublicationId: string | null }[];
  api: <T>(url: string, body?: unknown) => Promise<T>;
  disabled: boolean;
  draftDirty: boolean;
  confirmDiscard: () => Promise<boolean>;
  physical?: { sourceBase: string; publication: ProfilePublication };
}>();
const emit = defineEmits<{
  dirty: [value: boolean];
  lock: [value: boolean];
  updated: [resourceId: string];
}>();
const {
  proposals,
  nextCursor,
  selected,
  baseId,
  summary,
  kind,
  rule,
  example,
  proposalContent,
  loadedBaseId,
  targetId,
  overrideCommon,
  reason,
  confirmed,
  message,
  error,
  errorSummary,
  preview,
  busy,
  mayReview,
  bases,
  structuralItems,
  run,
  refresh,
  propose,
  loadStructure,
  select,
  review,
  decide,
} = useCurationPanel(props, emit);
</script>

<template>
  <section
    :aria-label="physical ? 'Curadoria de particularidades físicas' : 'Curadoria do conhecimento'"
  >
    <h3>Propostas de conhecimento</h3>
    <p>
      Envio explícito, proveniência e revisão por curador. Incorporar altera apenas o rascunho; não
      publica nem confirma fatos técnicos.
    </p>
    <p v-if="physical">
      Propostas vinculadas ao perfil publicado desta base. Incorporação altera somente seu rascunho;
      publique e adote a nova versão separadamente.
    </p>
    <p v-if="error" ref="errorSummary" class="error" role="alert" tabindex="-1">{{ error }}</p>
    <p v-if="message" role="status">{{ message }}</p>
    <fieldset :disabled="disabled || busy">
      <CurationProposalList
        :proposals="proposals"
        :next-cursor="nextCursor"
        @refresh="run(() => refresh())"
        @more="run(() => refresh(true))"
        @select="select"
      />
      <CurationProposalDetail
        v-if="selected"
        :selected="selected"
        :may-review="mayReview"
        :draft-dirty="draftDirty"
        :physical="!!physical"
        :preview="preview"
        :reason="reason"
        :confirmed="confirmed"
        @update:reason="reason = $event"
        @update:confirmed="confirmed = $event"
        @review="review"
        @decide="decide"
      />
      <CurationProposalForm
        v-model:example="example"
        :physical="!!physical"
        :bases="bases"
        :base-id="baseId"
        :summary="summary"
        :kind="kind"
        :rule="rule"
        :proposal-content="proposalContent"
        :loaded-base-id="loadedBaseId"
        :target-id="targetId"
        :override-common="overrideCommon"
        :structural-items="structuralItems"
        @update:base-id="baseId = $event"
        @update:summary="summary = $event"
        @update:kind="kind = $event"
        @update:rule="rule = $event"
        @update:proposal-content="proposalContent = $event"
        @update:target-id="targetId = $event"
        @update:override-common="overrideCommon = $event"
        @load-structure="loadStructure"
        @propose="propose"
      />
    </fieldset>
  </section>
</template>
