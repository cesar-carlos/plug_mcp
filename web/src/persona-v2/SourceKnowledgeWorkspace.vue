<script setup lang="ts">
import { nextTick, ref } from "vue";
import PublishedKnowledgePicker from "./PublishedKnowledgePicker.vue";
import SourceInspectionPanel from "./SourceInspectionPanel.vue";
import PhysicalProfileEditor from "./PhysicalProfileEditor.vue";
import KnowledgeCurationPanel from "./KnowledgeCurationPanel.vue";
import KnowledgeReviewCalendar from "./KnowledgeReviewCalendar.vue";
import KnowledgeContentSummary from "./KnowledgeContentSummary.vue";
import SourceKnowledgeAdoptionFields from "./SourceKnowledgeAdoptionFields.vue";
import SourceKnowledgeCompatibility from "./SourceKnowledgeCompatibility.vue";
import type { Source, Training } from "./model";
import type { OperationTraining } from "./operation-editor";
import {
  sourceKnowledgeApplyDisabled,
  sourceKnowledgeConfirmDisabled,
  sourceKnowledgeHasNnRelationships,
} from "./source-knowledge";
import { useSourceKnowledge } from "./use-source-knowledge";

const props = defineProps<{
  sources: Source[];
  personaBase: string;
  api: <T>(url: string, body?: unknown) => Promise<T>;
  disabled: boolean;
  confirmDiscard: () => Promise<boolean>;
  initialSourceId?: string;
  registration?: boolean;
  training?: Training;
  operationTraining?: OperationTraining;
}>();
const emit = defineEmits<{
  dirty: [value: boolean];
  lock: [value: boolean];
  training: [value: Training];
  operationTraining: [value: OperationTraining];
}>();
const picker = ref<InstanceType<typeof PublishedKnowledgePicker>>();
const {
  sourceId,
  source,
  sourceBase,
  selection,
  inspection,
  comparison,
  page,
  curator,
  curationDirty,
  reviewDirty,
  inspectionDirty,
  profileDirty,
  pendingAdoption,
  busy,
  profileKey,
  workspaceKey,
  tables,
  fields,
  confirmed,
  message,
  error,
  errorSummary,
  dirty,
  content,
  selectionKey,
  inspectionContent,
  draftTraining,
  sectionLabel,
  title,
  confirmLabel,
  chooseSource,
  discardPending,
  beforeSelectionChange,
  compare,
  apply,
  removeReference,
  markTouched,
} = useSourceKnowledge(props, emit);

async function reload(): Promise<void> {
  await nextTick();
  await picker.value?.reloadProfiles();
}
</script>

<template>
  <section :aria-label="sectionLabel">
    <h2 v-if="!draftTraining">{{ title }}</h2>
    <h3 v-else>{{ title }}</h3>
    <p>
      Escolha uma versão publicada, inspecione a base e confira a compatibilidade. Nenhum padrão ou
      perfil é adotado automaticamente.
    </p>
    <p v-if="registration" class="notice">
      Etapa opcional após conectar a base. Reutilize um ERP do catálogo autorizado, como Data7,
      selecionando sua versão publicada. A inspeção usa somente metadados pelo plug_server e agente.
      A seleção fica em memória; o vínculo executável será salvo no treinamento da skill após adoção
      explícita. Compatibilidade não publica consultas nem concede permissões.
    </p>
    <p v-if="error" ref="errorSummary" role="alert" tabindex="-1" class="error">{{ error }}</p>
    <p v-if="message" role="status">{{ message }}</p>
    <button
      v-if="dirty"
      type="button"
      class="secondary"
      :disabled="disabled || busy"
      @click="discardPending"
    >
      Descartar seleção e inspeção pendentes
    </button>
    <label v-if="!draftTraining"
      >Base para conhecimento<select
        :value="sourceId"
        :disabled="disabled || busy"
        @change="chooseSource"
      >
        <option value="">Selecione uma base</option>
        <option v-for="s in sources" :key="s.id" :value="s.id" :disabled="!s.active">
          {{ s.name }} — {{ s.dialect }}{{ s.active ? "" : " (suspensa)" }}
        </option>
      </select></label
    >
    <p v-if="draftTraining?.sharedKnowledge" class="notice">
      Este rascunho tem uma referência compartilhada salva. Uma nova inspeção permite revisar sua
      adoção; alterar a seleção não muda a publicação ativa.
    </p>
    <button
      v-if="draftTraining?.sharedKnowledge"
      type="button"
      class="secondary"
      :disabled="disabled || busy"
      @click="removeReference"
    >
      Remover vínculo compartilhado do rascunho
    </button>
    <template v-if="source && source.active">
      <PublishedKnowledgePicker
        :key="`${source.id}:${workspaceKey}`"
        ref="picker"
        :source="source"
        :source-base="sourceBase"
        :api="api"
        :disabled="disabled || busy"
        :initial="draftTraining?.sharedKnowledge"
        :before-change="beforeSelectionChange"
        @selection="selection = $event"
        @profiles="page = $event"
        @curator="curator = $event"
        @touched="markTouched"
      />
      <p v-if="selection?.profile" class="notice">
        Perfil selecionado: {{ selection.profile.name }} · revisão {{ selection.profile.revision }}.
        Vinculado somente a esta identidade física.
      </p>
      <details v-if="!draftTraining && content">
        <summary>Conhecimento publicado selecionado</summary>
        <KnowledgeContentSummary :content="content" :dialect="source.dialect" />
      </details>
      <SourceKnowledgeAdoptionFields
        v-if="draftTraining && content"
        v-model:tables="tables"
        v-model:fields="fields"
        :content="content"
        :operation-training="operationTraining"
        :disabled="disabled || busy"
        @pending="pendingAdoption = true"
      />
      <SourceInspectionPanel
        :key="`inspection:${source.id}:${workspaceKey}`"
        :source="source"
        :source-base="sourceBase"
        :api="api"
        :disabled="disabled || busy"
        :content="inspectionContent"
        @result="inspection = $event"
        @dirty="inspectionDirty = $event"
        @lock="emit('lock', $event)"
      />
      <SourceKnowledgeCompatibility
        v-if="selection"
        :selection="selection"
        :inspection="inspection"
        :comparison="comparison"
        :content="content"
        :disabled="disabled"
        :busy="busy"
        @compare="compare"
      />
      <template v-if="draftTraining && selection && content">
        <p v-if="sourceKnowledgeHasNnRelationships(content)" class="notice">
          Caminhos N:N conservam tabelas intermediárias e todos os elos selecionados. Somente esses
          elos diretos entram na validação do SQL; o caminho não autoriza JOIN entre as
          extremidades. Revise a seleção e a prova física antes de publicar.
        </p>
        <KnowledgeContentSummary :content="content" :dialect="source.dialect" />
        <label class="check"
          ><input
            v-model="confirmed"
            type="checkbox"
            :disabled="
              sourceKnowledgeConfirmDisabled({
                disabled,
                busy,
                comparisonStatus: comparison?.status,
              })
            "
          />{{ confirmLabel }}</label
        >
        <button
          type="button"
          :disabled="
            sourceKnowledgeApplyDisabled({
              disabled,
              busy,
              comparisonStatus: comparison?.status,
              confirmed,
            })
          "
          @click="apply"
        >
          Aplicar conhecimento ao rascunho
        </button>
      </template>
      <PhysicalProfileEditor
        v-if="!draftTraining && selection && curator"
        :key="`${selectionKey}:${profileKey}`"
        :selection="selection"
        :page="page"
        :inspection="inspection"
        :source-base="sourceBase"
        :dialect="source.dialect"
        :api="api"
        :disabled="disabled || busy"
        :confirm-discard="confirmDiscard"
        @dirty="profileDirty = $event"
        @lock="emit('lock', $event)"
        @saved="reload"
        @more-drafts="picker?.moreDrafts()"
      />
      <p v-else-if="!draftTraining && selection" class="notice">
        Perfis podem ser publicados somente por curador ou administrador com acesso vigente à base.
      </p>
      <KnowledgeCurationPanel
        v-if="!draftTraining && selection?.profile && !selection.profile.suspended"
        :key="`curation:${selectionKey}:${profileKey}`"
        :catalog-id="selection.catalogId"
        role="contributor"
        :patterns="[]"
        :physical="{ sourceBase, publication: selection.profile }"
        :api="api"
        :disabled="disabled || busy"
        :draft-dirty="profileDirty"
        :confirm-discard="confirmDiscard"
        @dirty="curationDirty = $event"
        @lock="emit('lock', $event)"
        @updated="reload"
      />
      <KnowledgeReviewCalendar
        v-if="!draftTraining && curator && selection?.profile && !selection.profile.suspended"
        :key="`review:${selectionKey}:${profileKey}`"
        :root="`${sourceBase}/perfis/${selection.catalogId}/${selection.profile.publicationId}/revisao`"
        :api="api"
        :disabled="disabled || busy"
        :confirm-discard="confirmDiscard"
        @dirty="reviewDirty = $event"
        @lock="emit('lock', $event)"
      />
    </template>
    <p v-else class="notice">
      Selecione uma base ativa e com identidade comprovada. A persona também pode usar treinamento
      privado.
    </p>
  </section>
</template>
