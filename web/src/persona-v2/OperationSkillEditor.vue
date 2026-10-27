<script setup lang="ts">
import ListSearch from "./ListSearch.vue";
import OperationStructureFields from "./OperationStructureFields.vue";
import OperationStepsFields from "./OperationStepsFields.vue";
import OperationCasesPanel from "./OperationCasesPanel.vue";
import OperationRelationshipsEditor from "./OperationRelationshipsEditor.vue";
import SourceKnowledgeWorkspace from "./SourceKnowledgeWorkspace.vue";
import SkillAdvancedJson from "./SkillAdvancedJson.vue";
import SkillPublicationPanel from "./SkillPublicationPanel.vue";
import SkillTestReports from "./SkillTestReports.vue";
import type { Source } from "./model";
import { useOperationSkillEditor } from "./use-operation-skill-editor";

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
  selected,
  revision,
  name,
  slug,
  training,
  busy,
  message,
  tests,
  caseDirty,
  caseKey,
  reviewDate,
  confirmed,
  preview,
  active,
  advanced,
  advancedOpen,
  knowledgeDirty,
  knowledgeKey,
  relationships,
  draftDirty,
  error,
  errorSummary,
  editorRoot,
  errorId,
  invalid,
  selectChanged,
  refresh,
  save,
  saveCase,
  sourceChange,
  knowledgeLock,
  adoptKnowledge,
  review,
  publish,
  moreReports,
  applyAdvanced,
} = useOperationSkillEditor(props, emit);
</script>
<template>
  <section ref="editorRoot" aria-label="Treinamento de operação SQL">
    <h2>Treinar operações SQL</h2>
    <ListSearch
      v-if="drafts.length"
      v-model="search"
      label="Buscar operações SQL"
      :matches="matchingDrafts.length"
      :total="drafts.length"
    />
    <p>
      Uma base por operação. A publicação exige casos obrigatórios aprovados pelo runner isolado e
      revisão de significado pelo responsável.
    </p>
    <p v-if="error" :id="errorId" ref="errorSummary" role="alert" tabindex="-1" class="error">
      {{ error }}
    </p>
    <p v-if="message" role="status" class="success">{{ message }}</p>
    <fieldset :disabled="busy || disabled || caseDirty">
      <label
        >Editar operação SQL<select :value="selected" @change="selectChanged">
          <option value="">Nova operação SQL</option>
          <option
            v-for="d in drafts.filter((d) => d.id === selected || matchingDrafts.includes(d))"
            :key="d.id"
            :value="d.id"
          >
            {{ d.name }} · revisão {{ d.revision }}
          </option>
        </select></label
      >
      <button type="button" @click="refresh">Recarregar operação SQL</button>
      <p v-if="active">
        Publicação ativa: {{ active.package.name }} · revisão {{ active.revision }}. Alterar o
        rascunho não muda este contrato.
      </p>
      <form aria-label="Contrato de operação SQL" @submit.prevent="save">
        <label
          >Nome da operação<input
            v-model="name"
            required
            maxlength="200"
            :aria-invalid="invalid('name') || undefined"
            :aria-describedby="invalid('name') ? errorId : undefined"
        /></label>
        <label
          >Identificador curto da operação<input
            v-model="slug"
            :aria-invalid="invalid('slug') || undefined"
            :aria-describedby="invalid('slug') ? errorId : undefined"
            :disabled="!!selected"
            required
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            maxlength="100"
        /></label>
        <p v-if="invalid('training')" tabindex="-1" aria-invalid="true" :aria-describedby="errorId">
          Revise o conteúdo do contrato de operação. O servidor não indicou um campo interno
          específico.
        </p>
        <label
          >Base da operação<select :value="training.sourceId" required @change="sourceChange">
            <option value="">Selecione</option>
            <option
              v-for="source in sources.filter((s) => s.active && s.dialect !== 'firebird')"
              :key="source.id"
              :value="source.id"
            >
              {{ source.name }} · {{ source.dialect }}
            </option>
          </select></label
        >
        <OperationStructureFields v-model="training" />
        <OperationStepsFields v-model="training" />
        <OperationRelationshipsEditor v-model="relationships" :tables="training.tables" />
        <p v-if="training.sharedKnowledge">
          Versões compartilhadas fixadas neste rascunho. Publicação revalida identidade, estrutura e
          concessões.
        </p>
        <p v-if="draftDirty">Há alterações não salvas no contrato.</p>
        <button :disabled="caseDirty || knowledgeDirty || advancedOpen">Salvar operação SQL</button>
      </form>
      <SkillAdvancedJson
        v-model:json="advanced"
        v-model:open="advancedOpen"
        :value="training"
        :disabled="knowledgeDirty"
        summary="Contrato JSON avançado"
        label="JSON da operação"
        edit-label="Editar JSON da operação"
        apply-label="Aplicar JSON ao rascunho"
        close-label="Fechar JSON sem aplicar"
        @apply="applyAdvanced"
      />
    </fieldset>
    <SourceKnowledgeWorkspace
      v-if="training.sourceId && !advancedOpen"
      :key="`operation-knowledge:${selected}:${knowledgeKey}`"
      :sources="sources"
      :persona-base="base"
      :api="api"
      :disabled="busy || disabled || caseDirty"
      :confirm-discard="confirmDiscard"
      :operation-training="training"
      @operation-training="adoptKnowledge"
      @dirty="knowledgeDirty = $event"
      @lock="knowledgeLock"
    />
    <template v-if="selected && tests">
      <OperationCasesPanel
        :key="caseKey"
        :api="api"
        :base="base"
        :skill-id="selected"
        :revision="revision"
        :training="training"
        :cases="tests.cases"
        :disabled="busy || disabled || draftDirty || knowledgeDirty || advancedOpen"
        :confirm-discard="confirmDiscard"
        @dirty="caseDirty = $event"
        @save="saveCase"
        @lock="knowledgeLock"
      />
      <SkillTestReports
        heading="Relatórios do runner"
        approved-label="Relatório técnico atual aprovado; falta revisão semântica e publicação."
        missing-label="Sem relatório obrigatório aprovado e atual. Solicite uma rodada isolada ao operador."
        empty-label="Nenhum relatório registrado. Ausência de relatório não comprova ausência de testes."
        results-summary="Resultados por caso"
        more-label="Mais relatórios SQL"
        :reports="tests.reports"
        :required-approved="tests.requiredApproved"
        :next-cursor="tests.nextCursor"
        :cases="tests.cases"
        :more-disabled="busy || disabled"
        @more="moreReports"
      />
      <SkillPublicationPanel
        v-model:review-date="reviewDate"
        v-model:confirmed="confirmed"
        :preview="preview"
        :required-approved="tests.requiredApproved"
        :disabled="busy || disabled || draftDirty || caseDirty || knowledgeDirty || advancedOpen"
        legend="Revisão e publicação da operação"
        date-label="Revisar esta operação até"
        review-action="Revisar publicação SQL"
        confirm-label="Revisei o significado, etapas, limites, efeitos indiretos e aprovação desta operação."
        publish-action="Confirmar publicação SQL"
        @review="review"
        @publish="publish"
      >
        <template v-if="preview" #preview-meta>
          <p>
            Revisão {{ preview.revision }} · prévia válida até
            {{ new Date(preview.expiresAt).toLocaleString() }} · revisão de conhecimento até
            {{ new Date(preview.reviewDueAt).toLocaleString() }}
          </p>
        </template>
      </SkillPublicationPanel>
    </template>
  </section>
</template>
