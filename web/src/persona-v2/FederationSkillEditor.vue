<script setup lang="ts">
import ListSearch from "./ListSearch.vue";
import FederationCasesPanel from "./FederationCasesPanel.vue";
import FederationContractFields from "./FederationContractFields.vue";
import SkillAdvancedJson from "./SkillAdvancedJson.vue";
import SkillPublicationPanel from "./SkillPublicationPanel.vue";
import SkillTestReports from "./SkillTestReports.vue";
import type { Source } from "./model";
import { useFederationSkillEditor } from "./use-federation-skill-editor";

const props = defineProps<{
  api: <T>(url: string, body?: unknown) => Promise<T>;
  base: string;
  sources: Source[];
  disabled: boolean;
  confirmDiscard: () => Promise<boolean>;
}>();
const emit = defineEmits<{ dirty: [boolean]; lock: [boolean]; changed: [] }>();
const {
  search,
  matchingDrafts,
  drafts,
  publications,
  selected,
  revision,
  name,
  slug,
  training,
  busy,
  message,
  caseDirty,
  caseKey,
  reviewDate,
  confirmed,
  tests,
  preview,
  active,
  advanced,
  advancedOpen,
  draftDirty,
  error,
  errorSummary,
  editorRoot,
  errorId,
  invalid,
  select,
  refresh,
  save,
  saveCase,
  review,
  publish,
  moreReports,
  applyAdvanced,
} = useFederationSkillEditor(props, emit);
</script>
<template>
  <section ref="editorRoot" aria-label="Treinamento de cruzamento">
    <h2>Treinar cruzamentos</h2>
    <ListSearch
      v-if="drafts.length"
      v-model="search"
      label="Buscar cruzamentos"
      :matches="matchingDrafts.length"
      :total="drafts.length"
    />
    <p>
      Combine consultas publicadas de bases diferentes. Publicar exige casos obrigatórios com
      relatório atual e revisão humana; não concede acesso nem executa consultas.
    </p>
    <p v-if="error" :id="errorId" ref="errorSummary" role="alert" tabindex="-1" class="error">
      {{ error }}
    </p>
    <p v-if="message" role="status" class="success">{{ message }}</p>
    <fieldset :disabled="busy || disabled || caseDirty">
      <label
        >Editar cruzamento<select :value="selected" @change="select">
          <option value="">Novo cruzamento</option>
          <option
            v-for="d in drafts.filter((d) => d.id === selected || matchingDrafts.includes(d))"
            :key="d.id"
            :value="d.id"
          >
            {{ d.name }} · revisão {{ d.revision }}
          </option>
        </select></label
      >
      <button type="button" @click="refresh">Recarregar cruzamento</button>
      <p v-if="active">
        Publicação ativa: {{ active.package.name }} · revisão {{ active.revision }}. Edições
        posteriores permanecem no rascunho.
      </p>
      <form aria-label="Contrato de cruzamento" @submit.prevent="save">
        <label
          >Nome do cruzamento<input
            v-model="name"
            required
            maxlength="200"
            :aria-invalid="invalid('name') || undefined"
            :aria-describedby="invalid('name') ? errorId : undefined"
        /></label>
        <label
          >Identificador curto do cruzamento<input
            v-model="slug"
            :aria-invalid="invalid('slug') || undefined"
            :aria-describedby="invalid('slug') ? errorId : undefined"
            required
            :disabled="!!selected"
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            maxlength="100"
        /></label>
        <p v-if="invalid('training')" tabindex="-1" aria-invalid="true" :aria-describedby="errorId">
          Revise o conteúdo do contrato de cruzamento. O servidor não indicou um campo interno
          específico.
        </p>
        <FederationContractFields v-model="training" :publications="publications" />
        <p v-if="draftDirty">Há alterações não salvas no cruzamento.</p>
        <button :disabled="advancedOpen">Salvar cruzamento</button>
      </form>
      <SkillAdvancedJson
        v-model:json="advanced"
        v-model:open="advancedOpen"
        :value="training"
        summary="Contrato JSON avançado do cruzamento"
        label="JSON do cruzamento"
        edit-label="Editar JSON do cruzamento"
        apply-label="Aplicar JSON do cruzamento"
        close-label="Fechar JSON do cruzamento"
        @apply="applyAdvanced"
      />
    </fieldset>
    <template v-if="selected && tests">
      <FederationCasesPanel
        :key="caseKey"
        :api="api"
        :base="base"
        :skill-id="selected"
        :revision="revision"
        :training="training"
        :publications="publications"
        :cases="tests.cases"
        :disabled="busy || disabled || draftDirty || advancedOpen"
        :confirm-discard="confirmDiscard"
        @dirty="caseDirty = $event"
        @save="saveCase"
        @lock="emit('lock', $event)"
      />
      <SkillTestReports
        heading="Relatórios do cruzamento"
        approved-label="Relatório obrigatório atual aprovado; revise o significado antes de publicar."
        missing-label="Sem relatório obrigatório aprovado e atual. Solicite uma rodada isolada ao operador."
        empty-label="Nenhum relatório registrado. Ausência de relatório não comprova ausência de testes."
        results-summary="Resultados dos casos de cruzamento"
        more-label="Mais relatórios de cruzamento"
        :reports="tests.reports"
        :required-approved="tests.requiredApproved"
        :next-cursor="tests.nextCursor"
        :more-disabled="busy || disabled"
        @more="moreReports"
      />
      <SkillPublicationPanel
        v-model:review-date="reviewDate"
        v-model:confirmed="confirmed"
        :preview="preview"
        :required-approved="tests.requiredApproved"
        :disabled="busy || disabled || draftDirty || caseDirty || advancedOpen"
        legend="Revisão e publicação do cruzamento"
        date-label="Revisar este cruzamento até"
        review-action="Revisar publicação do cruzamento"
        confirm-label="Revisei correspondência, cardinalidade, ausência, duplicidades, unidades e completude do cruzamento."
        publish-action="Confirmar publicação do cruzamento"
        @review="review"
        @publish="publish"
      >
        <template v-if="preview" #preview-meta>
          <p>
            Prévia válida até {{ new Date(preview.expiresAt).toLocaleString() }} · revisão até
            {{ new Date(preview.reviewDueAt).toLocaleString() }}
          </p>
        </template>
      </SkillPublicationPanel>
    </template>
  </section>
</template>
