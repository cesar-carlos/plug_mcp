<script setup lang="ts">
import ListSearch from "./ListSearch.vue";
import ExternalContractFields from "./ExternalContractFields.vue";
import ExternalTestsPanel from "./ExternalTestsPanel.vue";
import ExternalImportPanel from "./ExternalImportPanel.vue";
import SkillAdvancedJson from "./SkillAdvancedJson.vue";
import SkillPublicationPanel from "./SkillPublicationPanel.vue";
import { useExternalSkillEditor } from "./use-external-skill-editor";

const props = defineProps<{
  api: <T>(url: string, body?: unknown) => Promise<T>;
  base: string;
  disabled: boolean;
  confirmDiscard: () => Promise<boolean>;
}>();
const emit = defineEmits<{ dirty: [boolean]; lock: [boolean]; changed: [] }>();
const {
  search,
  matchingDrafts,
  drafts,
  connections,
  selected,
  name,
  slug,
  contract,
  busy,
  caseBusy,
  caseDirty,
  caseKey,
  fieldsKey,
  message,
  published,
  staleContract,
  active,
  pending,
  tests,
  reviewDate,
  confirmed,
  preview,
  advanced,
  advancedOpen,
  importDirty,
  importPanel,
  draftDirty,
  pendingFields,
  error,
  errorSummary,
  editorRoot,
  errorId,
  invalid,
  select,
  refresh,
  save,
  copy,
  applyImport,
  caseLock,
  caseUpdated,
  review,
  publish,
  applyAdvanced,
} = useExternalSkillEditor(props, emit);
</script>
<template>
  <section ref="editorRoot" aria-label="Treinamento de ação externa">
    <h2>Treinar ações e consultas externas</h2>
    <ListSearch
      v-if="drafts.length"
      v-model="search"
      label="Buscar skills externas"
      :matches="matchingDrafts.length"
      :total="drafts.length"
    />
    <p>
      Use uma integração cadastrada pelo navegador. Contrato, casos, revisão e publicação são
      separados de concessões e da aprovação de cada ação.
    </p>
    <p v-if="error" :id="errorId" ref="errorSummary" role="alert" tabindex="-1" class="error">
      {{ error }}
    </p>
    <p v-if="message" role="status" class="success">{{ message }}</p>
    <ExternalImportPanel
      ref="importPanel"
      :api="api"
      :base="base"
      :connections="connections"
      :disabled="busy || disabled || caseBusy || caseDirty"
      :confirm-discard="confirmDiscard"
      @lock="caseLock"
      @dirty="importDirty = $event"
      @apply="applyImport"
    />
    <fieldset :disabled="busy || disabled || caseBusy || caseDirty">
      <label
        >Editar skill externa<select :value="selected" @change="select">
          <option value="">Nova skill externa</option>
          <option
            v-for="d in drafts.filter((d) => d.skillId === selected || matchingDrafts.includes(d))"
            :key="d.skillId"
            :value="d.skillId"
          >
            {{ d.name }} · revisão {{ d.revision }}{{ d.publicationId ? " · publicada" : "" }}
          </option>
        </select></label
      >
      <button type="button" @click="refresh">Recarregar skill externa</button>
      <p v-if="published">
        Contrato já publicado: alterações exigem nova skill/operação e novas concessões.
      </p>
      <p v-if="active">
        Publicação: {{ active.package.name }} · revisão {{ active.revision }} ·
        {{ active.suspendedAt ? "suspensa" : "ativa localmente" }}. Estado local não confirma
        autorização do consumidor.
      </p>
      <p v-else-if="published">
        Publicação indisponível. Não reative ou recupere concessões por edição.
      </p>
      <button v-if="selected" type="button" @click="copy">
        Preparar nova skill com este contrato
      </button>
      <p v-if="!connections.length">
        Cadastre uma integração e sua credencial pelo setup temporário do navegador. Este editor não
        solicita segredos.
      </p>
      <form aria-label="Contrato de skill externa" @submit.prevent="save">
        <fieldset :disabled="published || advancedOpen">
          <label
            >Nome da skill externa<input
              v-model="name"
              required
              maxlength="200"
              :aria-invalid="invalid('name') || undefined"
              :aria-describedby="invalid('name') ? errorId : undefined" /></label
          ><label
            >Identificador curto da skill externa<input
              v-model="slug"
              :aria-invalid="invalid('slug') || undefined"
              :aria-describedby="invalid('slug') ? errorId : undefined"
              required
              :disabled="!!selected"
              maxlength="100"
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
          /></label>
          <p
            v-if="invalid('contract')"
            tabindex="-1"
            aria-invalid="true"
            :aria-describedby="errorId"
          >
            Revise o contrato externo. O servidor não indicou um campo interno específico.
          </p>
          <ExternalContractFields
            :key="fieldsKey"
            v-model="contract"
            :connections="connections"
            :confirm-discard="confirmDiscard"
            @dirty="(key, value) => (pending[key] = value)"
          />
          <p v-if="draftDirty">Há alterações não salvas na skill externa.</p>
          <p v-if="pendingFields">
            Aplique ou descarte campos, schemas e valores pendentes antes de salvar.
          </p>
          <button :disabled="pendingFields || advancedOpen || staleContract">
            Salvar skill externa
          </button>
        </fieldset>
      </form>
      <SkillAdvancedJson
        v-if="!published"
        v-model:json="advanced"
        v-model:open="advancedOpen"
        :value="contract"
        :disabled="pendingFields"
        summary="Contrato externo JSON avançado"
        label="JSON da skill externa"
        edit-label="Editar JSON da skill externa"
        apply-label="Aplicar JSON da skill externa"
        close-label="Fechar JSON da skill externa"
        @apply="applyAdvanced"
      />
    </fieldset>
    <ExternalTestsPanel
      v-if="selected"
      :key="`${selected}:${caseKey}`"
      :skill-id="selected"
      :base="base"
      :api="api"
      :disabled="busy || disabled || draftDirty || pendingFields || advancedOpen || staleContract"
      :confirm-discard="confirmDiscard"
      @dirty="caseDirty = $event"
      @lock="caseLock"
      @updated="caseUpdated"
    />
    <SkillPublicationPanel
      v-if="selected && !published"
      v-model:review-date="reviewDate"
      v-model:confirmed="confirmed"
      :preview="preview"
      :required-approved="!!tests?.requiredApproved"
      :disabled="
        busy || disabled || caseBusy || draftDirty || pendingFields || caseDirty || advancedOpen
      "
      legend="Revisão e publicação externa"
      date-label="Revisar esta skill externa até"
      review-action="Revisar publicação externa"
      confirm-label="Revisei destino, entrada, saída, efeitos, conciliação e aprovação do contrato externo."
      publish-action="Confirmar publicação externa"
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
  </section>
</template>
