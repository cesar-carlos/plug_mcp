<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from "vue";
import AccessWorkspace from "./AccessWorkspace.vue";
import CatalogWorkspace from "./CatalogWorkspace.vue";
import { vFormFeedback } from "./form-feedback";
import ListSearch from "./ListSearch.vue";
import { useRoute } from "vue-router";
import { consoleAreas, type ConsoleArea } from "./navigation";
import GuidedSetupBanner from "./GuidedSetupBanner.vue";
import { usePersonaProgress } from "./use-persona-progress";
import BrandLogo from "./BrandLogo.vue";
import ConsoleHelp from "./ConsoleHelp.vue";
import ConsoleLogin from "./ConsoleLogin.vue";
import ConsoleNav from "./ConsoleNav.vue";
import DiscardDialog from "./DiscardDialog.vue";
import HistoryWorkspace from "./HistoryWorkspace.vue";
import IntegrationsWorkspace from "./IntegrationsWorkspace.vue";
import KnowledgeWorkspace from "./KnowledgeWorkspace.vue";
import OperationsWorkspace from "./OperationsWorkspace.vue";
import PersonaOverview from "./PersonaOverview.vue";
import PersonasWorkspace from "./PersonasWorkspace.vue";
import QueriesWorkspace from "./QueriesWorkspace.vue";
import SourcesWorkspace from "./SourcesWorkspace.vue";
import TrainingWorkspace from "./TrainingWorkspace.vue";
import ThemeSelect from "./ThemeSelect.vue";
import { consoleFieldLabels } from "./console-errors";
import type { UncertainIssuance } from "./token-permissions";
import { useConsoleDiscard, type ConsoleDiscardBindings } from "./use-console-discard";
import { useConsolePersona, type ConsolePersonaHooks } from "./use-console-persona";
import { useConsoleQuery } from "./use-console-query";
import { useConsoleRun } from "./use-console-run";
import { useConsoleSession, type ConsoleSessionWorkspace } from "./use-console-session";
import { useConsoleSources } from "./use-console-sources";
import { useConsoleTraining } from "./use-console-training";
import { useImportedDraftFocus } from "./use-imported-draft-focus";
import { ContextRequests, type Publication } from "./model";

const requests = new ContextRequests();
const knowledgeRequests = new ContextRequests();
const route = useRoute();
const area = computed(() => (route.name ?? "personas") as ConsoleArea);
function focusContent() {
  document.getElementById("console-content")?.focus();
}
watch(
  area,
  (value) => {
    document.title = `${consoleAreas.find((item) => item.id === value)?.label ?? "Console"} — Se7e`;
  },
  { immediate: true },
);
const menuOpen = ref(false);
const {
  dialogOpen,
  confirmDiscard,
  answerDiscard,
  tokenDirty,
  accessKey,
  settingsDirty,
  settingsKey,
  iconDirty,
  iconKey,
  notificationsDirty,
  notificationsKey,
  knowledgeDirty,
  knowledgeKey,
  sourceKnowledgeDirty,
  explorerDirty,
  knowledgeMaintenanceDirty,
  sourceKnowledgeKey,
  federationDirty,
  federationKey,
  externalTestsDirty,
  externalTestsKey,
  integrationManagementDirty,
  integrationManagementKey,
  operationActionsDirty,
  operationActionsKey,
  externalActionsDirty,
  externalActionsKey,
  personaDirty,
  anyDirty,
  discardArea,
  resetPersonaEditors,
  bind: bindDiscard,
} = useConsoleDiscard();
let clearSession = (): void => undefined;
const {
  busy,
  error,
  message,
  errorArea,
  errorFields,
  errorForm,
  invalidField,
  focusErrorField,
  run,
} = useConsoleRun(area, () => {
  clearSession();
});
const uncertainIssuance = ref<Record<string, UncertainIssuance>>({});
const bearer = ref("");
const sessionWorkspace = {
  uncertainIssuance,
  knowledgeDirty,
  answerDiscard,
} as ConsoleSessionWorkspace;
const {
  logged,
  email,
  password,
  expiresSoon,
  api,
  knowledgeApi,
  login,
  logout,
  clearSession: endSession,
} = useConsoleSession(
  run,
  message,
  requests,
  knowledgeRequests,
  confirmDiscard,
  () => anyDirty.value,
  sessionWorkspace,
);
clearSession = endSession;
const personaHooks: ConsolePersonaHooks = {
  syncQueryPublications() {
    return;
  },
  resetWorkspace() {
    return;
  },
  selectDraft() {
    return;
  },
  clearDependentEditors() {
    return;
  },
  currentDraftId: () => "",
};
const {
  personas,
  personaId,
  loadedPersonaId,
  personaForm,
  personaIconFile,
  personaSearch,
  matchingPersonas,
  sources,
  drafts,
  publications,
  tokenPublications,
  persona,
  personaOpen,
  newPersonaDirty,
  importedDraftFocus,
  path,
  readPersonaData,
  applyPersonaData,
  load,
  choosePersona,
  createPersona,
  savePersona,
  changePersonaState,
  openImportedDraft,
  clearPersona,
} = useConsolePersona(
  api,
  run,
  confirmDiscard,
  () => personaDirty.value,
  () => anyDirty.value,
  discardArea,
  requests,
  message,
  error,
  logged,
  area,
  settingsDirty,
  personaHooks,
);
Object.assign(sessionWorkspace, {
  personaSearch,
  uncertainIssuance,
  knowledgeDirty,
  answerDiscard,
  loadedPersonaId,
  personas,
  personaId,
  personaForm,
  clearPersona,
});
const iconAppearance = ref<{ base: string; revision: number; hasIcon: boolean }>();
function updateIconAppearance(value: { base: string; revision: number; hasIcon: boolean }) {
  if (value.base === path()) iconAppearance.value = value;
}
const guidedSetupBase = computed(() => path());
const guidedSetup = usePersonaProgress(api, guidedSetupBase);
const guidedSetupOpen = ref(true);
watch(
  personaId,
  (id) => {
    guidedSetupOpen.value = true;
    if (id) void guidedSetup.load();
    else guidedSetup.reset();
  },
  { immediate: true },
);
const {
  queryPage,
  queryPageSize,
  submittedFilters,
  querySkill,
  querySql,
  queryValues,
  queryModes,
  queryDirty,
  grantedQueries,
  queryPublications,
  active,
  result,
  attachment,
  clearAttachment,
  clearQuerySession,
  resetQueryContext,
  mcp,
  inspectToken,
  query,
  createAttachment,
  downloadAttachment,
} = useConsoleQuery(requests, run, bearer, personaId, logged, publications, message);
const {
  training,
  name,
  slug,
  draftId,
  revision,
  preview,
  confirmed,
  reviewDate,
  skillSearch,
  queryDrafts,
  matchingDrafts,
  duplicateExamples,
  dirty,
  queryCaseDirty,
  queryTestsKey,
  externalSkillDirty,
  externalSkillKey,
  federationSkillDirty,
  federationSkillKey,
  operationSkillDirty,
  operationSkillKey,
  trainingKnowledgeDirty,
  trainingKnowledgeKey,
  mountedTrainingPanels,
  importedPanelsReady,
  resetTraining,
  editDraft,
  reloadTraining,
  selectDraft,
  changeTrainingSource,
  saveTraining,
  previewTraining,
  publishTraining,
  onTrainingRevisionSaved,
} = useConsoleTraining(
  drafts,
  sources,
  personaId,
  api,
  run,
  confirmDiscard,
  load,
  readPersonaData,
  applyPersonaData,
  path,
  message,
  area,
  busy,
  dialogOpen,
);
const {
  sourceForm,
  sourceReplacement,
  replacementConfirmed,
  sourceOpen,
  sourceSearch,
  matchingSources,
  highlightedSourceId,
  sourceFormVersions,
  sourcesDirty,
  sourceLifecycleDirty,
  sourceDirty,
  remountSourceEditors,
  clearSourceState,
  addSource,
  beginSourceReplacement,
  cancelSourceReplacement,
  changeSourceState,
  saveSource,
  reloadSource,
} = useConsoleSources(sources, api, run, confirmDiscard, load, path, message, () => {
  preview.value = undefined;
  confirmed.value = false;
  result.value = undefined;
});
useImportedDraftFocus({
  importedDraftFocus,
  busy,
  area,
  personaId,
  draftId,
  logged,
  importedPanelsReady,
});
personaHooks.syncQueryPublications = (published: Record<string, Publication>) => {
  if (querySkill.value && !published[querySkill.value]) {
    querySkill.value = "";
    result.value = undefined;
  }
};
personaHooks.selectDraft = selectDraft;
personaHooks.currentDraftId = () => draftId.value;
personaHooks.clearDependentEditors = () => {
  preview.value = undefined;
  confirmed.value = false;
  result.value = undefined;
};
personaHooks.resetWorkspace = () => {
  resetPersonaEditors();
  guidedSetup.reset();
  guidedSetupOpen.value = true;
  iconAppearance.value = undefined;
  skillSearch.value = "";
  importedDraftFocus.value = undefined;
  resetQueryContext();
  bearer.value = "";
  resetTraining();
  clearSourceState();
};
bindDiscard({
  busy,
  logged,
  personaId,
  persona,
  error,
  errorFields,
  message,
  menuOpen,
  bearer,
  clearQuerySession,
  queryDirty,
  trainingDirty: dirty,
  queryCaseDirty,
  trainingKnowledgeDirty,
  reviewDate,
  operationSkillDirty,
  federationSkillDirty,
  externalSkillDirty,
  sourceDirty,
  sourcesDirty,
  sourceLifecycleDirty,
  newPersonaDirty,
  resetTraining,
  remountSourceEditors,
  personaForm,
  personaIconFile,
  knowledgeRequests,
} satisfies ConsoleDiscardBindings);
onBeforeUnmount(() => {
  clearAttachment();
  requests.reset();
  knowledgeRequests.reset();
});
</script>

<template>
  <main v-form-feedback>
    <a v-if="logged" class="skip-link" href="#console-content" @click.prevent="focusContent"
      >Pular para o conteúdo</a
    >
    <header>
      <div class="brand">
        <BrandLogo />
        <div>
          <h1>Se7e — Personas</h1>
          <p>Conecte bases e ensine sua persona a consultar informações.</p>
        </div>
      </div>
      <ThemeSelect />
    </header>
    <p v-if="error && !logged" role="alert" class="error area-error" tabindex="-1">{{ error }}</p>
    <p v-if="message" role="status" class="success">{{ message }}</p>
    <p v-if="busy" role="status" class="notice processing-status">
      Processando solicitação… Aguarde a confirmação antes de repetir a ação.
    </p>
    <DiscardDialog v-if="dialogOpen" @answer="answerDiscard" />
    <p v-if="logged && expiresSoon" class="notice" role="status">
      Sua sessão termina em menos de dois minutos. Salve as edições pendentes.
    </p>
    <ConsoleLogin
      v-if="!logged"
      v-model:email="email"
      v-model:password="password"
      :busy="busy"
      @submit="login"
    />
    <div v-else class="console-layout">
      <ConsoleNav
        :area="area"
        :next-step-area="guidedSetup.nextStep.value?.area"
        :busy="busy"
        :expanded="menuOpen"
        @toggle="menuOpen = !menuOpen"
        @logout="logout"
      />
      <div class="console-workspace">
        <div v-if="error" role="alert" class="error area-error" tabindex="-1">
          <p>{{ error }}</p>
          <ul v-if="errorFields.length">
            <li v-for="field in errorFields" :key="field">
              <button type="button" class="secondary" @click="focusErrorField(field)">
                Confira {{ consoleFieldLabels[field] }}
              </button>
            </li>
          </ul>
        </div>
        <CatalogWorkspace
          v-if="area === 'catalog'"
          :knowledge-key="knowledgeKey"
          :api="knowledgeApi"
          :confirm-discard="confirmDiscard"
          :disabled="busy"
          @dirty="knowledgeDirty = $event"
          @lock="busy = $event"
          @open-draft="openImportedDraft"
        />
        <fieldset :disabled="busy">
          <ListSearch
            v-if="personas.length > 1"
            v-model="personaSearch"
            label="Buscar personas"
            :matches="matchingPersonas.length"
            :total="personas.length"
          />
          <label
            >Persona<select :value="personaId" @change="choosePersona">
              <option value="">Selecione</option>
              <option
                v-for="p in personas.filter(
                  (p) => p.id === personaId || matchingPersonas.includes(p),
                )"
                :key="p.id"
                :value="p.id"
              >
                {{ p.name }}{{ p.active ? "" : " (suspensa)" }}
              </option>
            </select></label
          >
        </fieldset>
        <GuidedSetupBanner
          v-if="persona && persona.active"
          :key="persona.id"
          v-model:open="guidedSetupOpen"
          :loading="guidedSetup.loading.value"
          :error="guidedSetup.error.value"
          :progress="guidedSetup.progress.value"
          :next-step="guidedSetup.nextStep.value"
          :pending-count="guidedSetup.pendingCount.value"
          @reload="guidedSetup.load()"
        />
        <h2 id="console-content" tabindex="-1" class="area-heading">
          {{ consoleAreas.find((item) => item.id === area)?.label }}
        </h2>
        <ConsoleHelp />
        <p v-if="!personaId && personas.length && area !== 'catalog'" class="notice">
          Selecione uma persona acima para acessar suas bases, treinamentos e permissões.
        </p>
        <p v-if="personaSearch && personaId" class="field-help">
          A persona selecionada permanece disponível mesmo quando não corresponde à busca.
        </p>
        <PersonasWorkspace
          v-model:open="personaOpen"
          v-model:name="personaForm.name"
          v-model:specialty="personaForm.specialty"
          v-model:instructions="personaForm.instructions"
          :active="area === 'personas'"
          :has-personas="personas.length > 0"
          :busy="busy"
          :invalid-field="invalidField"
          @submit="createPersona"
          @icon="personaIconFile = $event"
        />
        <template v-if="persona">
          <PersonaOverview
            v-show="area === 'overview'"
            :persona="persona"
            :busy="busy"
            :error-fields="
              errorForm === 'persona-settings' && errorArea === area ? errorFields : []
            "
            :settings-key="settingsKey"
            :icon-key="iconKey"
            :icon-appearance="iconAppearance"
            :api="api"
            :base="path()"
            @save="savePersona"
            @change-state="changePersonaState"
            @settings-dirty="settingsDirty = $event"
            @icon-dirty="iconDirty = $event"
            @icon-current="updateIconAppearance"
          />
          <SourcesWorkspace
            v-show="area === 'sources'"
            v-model:source-search="sourceSearch"
            v-model:form="sourceForm"
            v-model:replacement-confirmed="replacementConfirmed"
            v-model:source-open="sourceOpen"
            :sources="sources"
            :matching-sources="matchingSources"
            :highlighted-source-id="highlightedSourceId"
            :busy="busy"
            :invalid-field="invalidField"
            :replacement-name="sourceReplacement?.name"
            :source-form-versions="sourceFormVersions"
            :persona-id="personaId"
            :source-knowledge-key="sourceKnowledgeKey"
            :api="api"
            :base="path()"
            :confirm-discard="confirmDiscard"
            :active="area === 'sources'"
            @save="(id, input) => saveSource(id, input)"
            @rotate="(id, input) => saveSource(id, input, true)"
            @dirty="(id, value) => (sourcesDirty[id] = value)"
            @lifecycle-dirty="(id, value) => (sourceLifecycleDirty[id] = value)"
            @reload="reloadSource"
            @state="(id, active, input) => changeSourceState(id, active, input)"
            @replace="beginSourceReplacement"
            @submit="addSource"
            @cancel="cancelSourceReplacement"
            @knowledge-dirty="sourceKnowledgeDirty = $event"
            @lock="busy = $event"
          />
          <TrainingWorkspace
            v-if="area === 'training'"
            v-model:skill-search="skillSearch"
            v-model:draft-id="draftId"
            v-model:training="training"
            v-model:name="name"
            v-model:slug="slug"
            v-model:revision="revision"
            v-model:review-date="reviewDate"
            v-model:preview="preview"
            v-model:confirmed="confirmed"
            :sources="sources"
            :query-drafts="queryDrafts"
            :matching-drafts="matchingDrafts"
            :publications="publications"
            :invalid-field="invalidField"
            :duplicate-examples="duplicateExamples"
            :dirty="dirty"
            :query-case-dirty="queryCaseDirty"
            :training-knowledge-dirty="trainingKnowledgeDirty"
            :busy="busy"
            :persona-id="persona.id"
            :query-tests-key="queryTestsKey"
            :training-knowledge-key="trainingKnowledgeKey"
            :federation-skill-key="federationSkillKey"
            :external-skill-key="externalSkillKey"
            :operation-skill-key="operationSkillKey"
            :api="api"
            :base="path()"
            :confirm-discard="confirmDiscard"
            @edit-draft="editDraft"
            @reload-training="reloadTraining"
            @save="saveTraining"
            @change-source="changeTrainingSource"
            @preview="previewTraining"
            @publish="publishTraining"
            @query-case-dirty="queryCaseDirty = $event"
            @training-knowledge-dirty="trainingKnowledgeDirty = $event"
            @federation-dirty="federationSkillDirty = $event"
            @external-dirty="externalSkillDirty = $event"
            @operation-dirty="operationSkillDirty = $event"
            @lock="busy = $event"
            @changed="load"
            @panel-mounted="mountedTrainingPanels.add($event)"
            @revision-saved="onTrainingRevisionSaved"
          />
          <AccessWorkspace
            v-if="persona"
            v-show="area === 'tokens'"
            :key="`${persona.id}:${accessKey}`"
            v-model:bearer="bearer"
            v-model:uncertain-issuance="uncertainIssuance"
            :active="area === 'tokens'"
            :persona="persona"
            :api="api"
            :base="path()"
            :publications="tokenPublications"
            :sources="sources"
            :disabled="busy"
            :confirm-discard="confirmDiscard"
            :run="run"
            :call="mcp"
            @dirty="tokenDirty = $event"
            @lock="busy = $event"
            @status="message = $event"
          />
          <QueriesWorkspace
            v-show="area === 'queries'"
            v-model:bearer="bearer"
            v-model:query-skill="querySkill"
            v-model:query-sql="querySql"
            v-model:query-values="queryValues"
            v-model:query-modes="queryModes"
            v-model:query-page-size="queryPageSize"
            :busy="busy"
            :publications="queryPublications"
            :sources="sources"
            :active="active"
            :granted-queries="grantedQueries"
            :query-page="queryPage"
            :submitted-filters="submittedFilters"
            :result="result"
            :attachment="attachment"
            :persona-id="personaId"
            :federation-key="federationKey"
            :disabled="busy"
            :confirm-discard="confirmDiscard"
            :mcp="mcp"
            :active-area="area === 'queries'"
            @inspect="inspectToken"
            @query="query"
            @create-attachment="createAttachment"
            @download-attachment="downloadAttachment"
            @lock="busy = $event"
            @federation-dirty="federationDirty = $event"
          />
          <KnowledgeWorkspace
            v-if="area === 'knowledge'"
            :persona-id="personaId"
            :bearer="bearer"
            :source-knowledge-key="sourceKnowledgeKey"
            :publications="tokenPublications"
            :sources="sources"
            :api="api"
            :base="path()"
            :call="mcp"
            :disabled="busy"
            :confirm-discard="confirmDiscard"
            @explorer-dirty="explorerDirty = $event"
            @maintenance-dirty="knowledgeMaintenanceDirty = $event"
            @knowledge-dirty="sourceKnowledgeDirty = $event"
            @lock="busy = $event"
          />
          <OperationsWorkspace
            v-if="area === 'operations'"
            :persona-id="personaId"
            :operation-actions-key="operationActionsKey"
            :notifications-key="notificationsKey"
            :api="api"
            :base="path()"
            :sources="sources"
            :disabled="busy"
            :bearer="bearer"
            :call="mcp"
            :confirm-discard="confirmDiscard"
            @bearer="bearer = $event"
            @actions-dirty="operationActionsDirty = $event"
            @notifications-dirty="notificationsDirty = $event"
            @lock="busy = $event"
          />
          <HistoryWorkspace
            v-if="area === 'history'"
            :persona-id="personaId"
            :api="api"
            :base="path()"
          />
          <IntegrationsWorkspace
            v-if="area === 'integrations'"
            :persona-id="personaId"
            :integration-management-key="integrationManagementKey"
            :external-tests-key="externalTestsKey"
            :external-actions-key="externalActionsKey"
            :api="api"
            :base="path()"
            :disabled="busy"
            :bearer="bearer"
            :call="mcp"
            :confirm-discard="confirmDiscard"
            @management-dirty="integrationManagementDirty = $event"
            @tests-dirty="externalTestsDirty = $event"
            @actions-dirty="externalActionsDirty = $event"
            @bearer="bearer = $event"
            @lock="busy = $event"
          />
        </template>
      </div>
    </div>
  </main>
</template>
