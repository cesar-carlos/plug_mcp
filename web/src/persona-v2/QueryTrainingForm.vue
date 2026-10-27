<script setup lang="ts">
import type { Source, Training } from "./model";
import QueryColumnsFields from "./QueryColumnsFields.vue";
import QueryExamplesFields from "./QueryExamplesFields.vue";
import QueryIdentityFields from "./QueryIdentityFields.vue";
import QueryParametersFields from "./QueryParametersFields.vue";
import QueryRelationshipsFields from "./QueryRelationshipsFields.vue";
import QueryTablesFields from "./QueryTablesFields.vue";

defineProps<{
  draftId: string;
  sources: Source[];
  invalidField: (field: string) => boolean;
  duplicateExamples: readonly [string, string][];
  disabled: boolean;
  dirty: boolean;
}>();
const training = defineModel<Training>("training", { required: true });
const name = defineModel<string>("name", { required: true });
const slug = defineModel<string>("slug", { required: true });
const emit = defineEmits<{
  save: [];
  changeSource: [event: Event];
}>();
</script>
<template>
  <form aria-label="Treinar consulta" @submit.prevent="emit('save')">
    <fieldset :disabled="disabled">
      <QueryIdentityFields
        v-model:training="training"
        v-model:name="name"
        v-model:slug="slug"
        :draft-id="draftId"
        :sources="sources"
        :invalid-field="invalidField"
        @change-source="emit('changeSource', $event)"
      />
      <QueryTablesFields v-model="training" />
      <QueryColumnsFields v-model="training" />
      <QueryRelationshipsFields v-model="training" />
      <QueryParametersFields v-model="training" />
      <QueryExamplesFields v-model="training" :duplicate-examples="duplicateExamples" />
      <p v-if="dirty">Há alterações não salvas.</p>
      <button>Salvar rascunho</button>
    </fieldset>
  </form>
</template>
