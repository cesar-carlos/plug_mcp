<script setup lang="ts">
import {
  computed,
  reactive,
  ref,
  watch,
  nextTick,
  onBeforeUnmount,
  defineAsyncComponent,
} from "vue";
import type { AttachmentDescriptor } from "../../../src/domain/persona-v2/attachments";
import BinaryAttachmentEditor from "./BinaryAttachmentEditor.vue";
import RelationshipPathFields from "./RelationshipPathFields.vue";
import { useRoute, useRouter } from "vue-router";
import { consoleAreas, type ConsoleArea } from "./navigation";
import { queryParameters, type ParameterMode } from "./query-parameters";
import {
  publicationGrant,
  publicationEffectsLabel,
  publicationExternalOperations,
} from "./publication-grant";
import OperationsPanel from "./OperationsPanel.vue";
import OperationSkillEditor from "./OperationSkillEditor.vue";
const QueryTestsPanel = defineAsyncComponent(() => import("./QueryTestsPanel.vue"));
const FederationSkillEditor = defineAsyncComponent(() => import("./FederationSkillEditor.vue"));
import NotificationsPanel from "./NotificationsPanel.vue";
import ExternalActionsPanel from "./ExternalActionsPanel.vue";
import ExternalTestsPanel from "./ExternalTestsPanel.vue";
import IntegrationManagementPanel from "./IntegrationManagementPanel.vue";
const ExternalSkillEditor = defineAsyncComponent(() => import("./ExternalSkillEditor.vue"));
import FederationPanel from "./FederationPanel.vue";
import TokenManager from "./TokenManager.vue";
import ManagedIntegrationsSelector from "./ManagedIntegrationsSelector.vue";
import OAuthConnectionsPanel from "./OAuthConnectionsPanel.vue";
import FieldUseEditor from "./FieldUseEditor.vue";
import LimitsEditor from "./LimitsEditor.vue";
import type { QueryLimits, OperationLimits } from "../../../src/domain/persona-v2/execution-limits";
import type { FederationBudget } from "../../../src/domain/persona-v2/federation";
import { fieldCapabilityLabel } from "./field-capabilities";
import BrandLogo from "./BrandLogo.vue";
import DiscardDialog from "./DiscardDialog.vue";
import PersonaSettings from "./PersonaSettings.vue";
import PersonaState from "./PersonaState.vue";
import SourceSettings from "./SourceSettings.vue";
import SourceLifecycle from "./SourceLifecycle.vue";
import SharedKnowledgePanel from "./SharedKnowledgePanel.vue";
import SourceKnowledgeWorkspace from "./SourceKnowledgeWorkspace.vue";
import ProgressPanel from "./ProgressPanel.vue";
import ConnectionPanel from "./ConnectionPanel.vue";
import KnowledgeExplorer from "./KnowledgeExplorer.vue";
import { publicationDeadline } from "./publication-deadline";
import KnowledgeFeedbackPanel from "./KnowledgeFeedbackPanel.vue";
import OAuthConnectionInfo from "./OAuthConnectionInfo.vue";
import OwnerDelegationPanel from "./OwnerDelegationPanel.vue";
import { administrativeOptions } from "./administrative-options";
import HistoryPanel from "./HistoryPanel.vue";
import PublicationReview from "./PublicationReview.vue";
import RelationshipDiagram from "./RelationshipDiagram.vue";
import { duplicateSqlExamples } from "./training-visual";
import {
  ContextRequests,
  ConsoleRequestError,
  emptyTraining,
  type Persona,
  type Source,
  type Draft,
  type Publication,
  type GrantPublication,
  type Preview,
  type QueryResult,
  type Training,
  type ImportedDraftReference,
} from "./model";

const requests = new ContextRequests();
const importedDraftFocus = ref<Pick<ImportedDraftReference, "personaId" | "skillId">>();
interface PermissionLimits {
  queryLimits?: Partial<QueryLimits>;
  operationLimits?: Partial<OperationLimits>;
  federationLimits?: Partial<FederationBudget>;
}
const tokenLimits = ref<PermissionLimits>({});
const tokenSkillLimits = ref<Record<string, PermissionLimits>>({});
function resetTokenLimits() {
  tokenLimits.value = {};
  tokenSkillLimits.value = {};
}
function selectTokenSkill(id: string, checked: boolean) {
  selectedSkills.value = selectedSkills.value.filter((skillId) => skillId !== id);
  if (checked) {
    tokenSkillLimits.value[id] = {};
    selectedSkills.value.push(id);
  } else delete tokenSkillLimits.value[id];
}
const knowledgeRequests = new ContextRequests();
const route = useRoute(),
  router = useRouter();
const area = computed(() => (route.name ?? "personas") as ConsoleArea);
const menuOpen = ref(false),
  sourceOpen = ref(false),
  personaOpen = ref(false);
const expiresSoon = ref(false);
let warningTimer: number | undefined;
let revealTimer: number | undefined;
const errorArea = ref<ConsoleArea>("personas");
const errorFields = ref<readonly string[]>([]);
const fieldLabels: Record<string, string> = {
  name: "Nome",
  specialty: "Especialidade",
  instructions: "Instruções",
  purpose: "Finalidade",
  environment: "Ambiente",
  agentId: "AGENT_ID",
  email: "E-mail",
  password: "Senha",
  clientToken: "CLIENT_TOKEN",
  dialect: "Dialeto",
  expectedVersion: "Versão do cadastro",
  slug: "Identificação",
  training: "Treinamento",
  permissions: "Permissões",
  delegation: "Delegação",
  expiresAt: "Validade",
  rowRestrictions: "Recortes obrigatórios",
};
const invalidField = (field: string) =>
  errorArea.value === area.value && errorFields.value.includes(field);
function focusErrorField(field: string) {
  const input = document.querySelector<HTMLElement>(
    `[data-error-field="${errorArea.value}:${field}"]`,
  );
  if (input?.getClientRects().length) input.focus();
  else document.querySelector<HTMLElement>(".area-error")?.focus();
}
const dialogOpen = ref(false);
let discardAnswer: ((value: boolean) => void) | undefined;
function answerDiscard(value: boolean) {
  dialogOpen.value = false;
  discardAnswer?.(value);
  discardAnswer = undefined;
}
function confirmDiscard(): Promise<boolean> {
  dialogOpen.value = true;
  return new Promise((resolve) => {
    discardAnswer = resolve;
  });
}
const settingsKey = ref(0),
  knowledgeKey = ref(0);
const tokenRefresh = ref(0),
  tokenManagerDirty = ref(false),
  tokenManagerKey = ref(0);
const uncertainIssuance = ref<
  Record<
    string,
    {
      checked: boolean;
      tokens: { id: string; name: string; revokedAt: string | null }[];
    }
  >
>({});
const issuanceRecovery = computed(() => uncertainIssuance.value[personaId.value]);
const showBearer = ref(false),
  tokenDays = ref(30),
  tokenNoExpiry = ref(false);
const queryPage = ref(1),
  queryPageSize = ref(100);
const submittedFilters = ref<Record<string, unknown>>({});
const logged = ref(false),
  busy = ref(false),
  error = ref(""),
  message = ref("");
const csrf = ref(""),
  email = ref(""),
  password = ref("");
let expiration: number | undefined;
const loadedPersonaId = ref("");
const personas = ref<Persona[]>([]),
  personaId = ref("");
const personaForm = reactive({ name: "", specialty: "", instructions: "" });
const sources = ref<Source[]>([]),
  drafts = ref<Draft[]>([]);
const sourceForm = reactive<{
  name: string;
  purpose: string;
  environment: string;
  agentId: string;
  clientToken: string;
  email: string;
  password: string;
  dialect: Source["dialect"];
}>({
  name: "",
  purpose: "",
  environment: "desenvolvimento",
  agentId: "",
  clientToken: "",
  email: "",
  password: "",
  dialect: "mssql",
});
const sourceReplacement = ref<{ id: string; version: number; name: string }>();
const replacementConfirmed = ref(false);
const highlightedSourceId = ref("");
const training = ref(emptyTraining()),
  name = ref(""),
  slug = ref(""),
  draftId = ref("");
const saved = ref(JSON.stringify({ name: "", slug: "", training: emptyTraining() })),
  revision = ref(0),
  preview = ref<Preview>(),
  confirmed = ref(false);
const publications = ref<Record<string, Publication>>({});
const additionalPublications = ref<Record<string, GrantPublication>>({});
const tokenPublications = computed<Record<string, GrantPublication>>(() => ({
  ...publications.value,
  ...additionalPublications.value,
}));
const selectedSkills = ref<string[]>([]),
  tokenAdministrative = ref<string[]>([]),
  tokenAdministrativeSources = ref<string[]>([]),
  tokenManagedIntegrations = ref<string[]>([]),
  tokenCanDelegate = ref(false),
  delegationDirty = ref(false),
  delegationKey = ref(0),
  tokenName = ref(""),
  bearer = ref("");
const querySkill = ref(""),
  querySql = ref(""),
  queryValues = reactive<Record<string, string>>({});
const queryModes = reactive<Record<string, ParameterMode>>({});
const grantedQueries = ref<{ id: string; name: string; publicationId: string; hash: string }[]>();
const queryPublications = computed(() =>
  Object.fromEntries(
    Object.entries(publications.value).filter(
      ([id, p]) =>
        grantedQueries.value === undefined ||
        grantedQueries.value.some(
          (g) => g.id === id && g.publicationId === p.id && g.hash === p.hash,
        ),
    ),
  ),
);
const result = ref<QueryResult>();
const attachment = ref<AttachmentDescriptor>();
let attachmentDownload: AbortController | undefined;
function clearAttachment() {
  attachmentDownload?.abort();
  attachmentDownload = undefined;
  attachment.value = undefined;
}
const reviewDate = ref("");
watch(reviewDate, () => {
  preview.value = undefined;
  confirmed.value = false;
});
const settingsDirty = ref(false);
const queryCaseDirty = ref(false),
  queryTestsKey = ref(0);
const externalSkillDirty = ref(false),
  externalSkillKey = ref(0);
const federationSkillDirty = ref(false),
  federationSkillKey = ref(0);
const operationSkillDirty = ref(false),
  operationSkillKey = ref(0);
const oauthConnectionsDirty = ref(false),
  oauthConnectionsKey = ref(0);
const notificationsDirty = ref(false),
  notificationsKey = ref(0);
const knowledgeDirty = ref(false);
const sourceKnowledgeDirty = ref(false),
  explorerDirty = ref(false),
  knowledgeMaintenanceDirty = ref(false),
  trainingKnowledgeDirty = ref(false);
const sourceKnowledgeKey = ref(0),
  trainingKnowledgeKey = ref(0);
const sourcesDirty = reactive<Record<string, boolean>>({});
const sourceLifecycleDirty = reactive<Record<string, boolean>>({});
const federationDirty = ref(false),
  federationKey = ref(0);
const externalTestsDirty = ref(false),
  externalTestsKey = ref(0);
const integrationManagementDirty = ref(false),
  integrationManagementKey = ref(0);
const operationActionsDirty = ref(false),
  operationActionsKey = ref(0),
  externalActionsDirty = ref(false),
  externalActionsKey = ref(0);
const sourceFormVersions = reactive<Record<string, number>>({});
const sourceDirty = computed(
  () =>
    !!(
      sourceReplacement.value ||
      sourceForm.name ||
      sourceForm.purpose ||
      sourceForm.agentId ||
      sourceForm.email ||
      sourceForm.password ||
      sourceForm.clientToken ||
      sourceForm.environment !== "desenvolvimento" ||
      sourceForm.dialect !== "mssql"
    ),
);
const newPersonaDirty = computed(
  () => !!(personaForm.name || personaForm.specialty || personaForm.instructions),
);
const tokenDirty = computed(
  () =>
    oauthConnectionsDirty.value ||
    Object.keys(tokenLimits.value).some(
      (key) => tokenLimits.value[key as keyof PermissionLimits] !== undefined,
    ) ||
    !!tokenName.value ||
    tokenAdministrative.value.length > 0 ||
    tokenAdministrativeSources.value.length > 0 ||
    tokenManagedIntegrations.value.length > 0 ||
    tokenCanDelegate.value ||
    delegationDirty.value ||
    selectedSkills.value.length > 0 ||
    tokenManagerDirty.value ||
    tokenNoExpiry.value ||
    tokenDays.value !== 30,
);
const personaDirty = computed(
  () =>
    integrationManagementDirty.value ||
    externalSkillDirty.value ||
    federationSkillDirty.value ||
    operationSkillDirty.value ||
    queryCaseDirty.value ||
    dirty.value ||
    !!reviewDate.value ||
    sourceKnowledgeDirty.value ||
    explorerDirty.value ||
    knowledgeMaintenanceDirty.value ||
    trainingKnowledgeDirty.value ||
    settingsDirty.value ||
    notificationsDirty.value ||
    sourceDirty.value ||
    federationDirty.value ||
    externalTestsDirty.value ||
    operationActionsDirty.value ||
    externalActionsDirty.value ||
    tokenDirty.value ||
    Object.values(sourcesDirty).some(Boolean) ||
    Object.values(sourceLifecycleDirty).some(Boolean),
);
const anyDirty = computed(
  () => personaDirty.value || newPersonaDirty.value || knowledgeDirty.value,
);
const persona = computed(() => personas.value.find((p) => p.id === personaId.value));
const fingerprint = computed(() =>
  JSON.stringify({ name: name.value, slug: slug.value, training: training.value }),
);
const dirty = computed(() => fingerprint.value !== saved.value);
const active = computed(() => publications.value[querySkill.value]);
const duplicateExamples = computed(() =>
  duplicateSqlExamples([
    { id: "modelo-principal", dialect: training.value.dialect, sql: training.value.sqlModel },
    ...(training.value.examples ?? []).map((e) => ({ ...e, dialect: training.value.dialect })),
  ]),
);
const path = () => `/api/admin/personas/${personaId.value}`;
const api = <T,>(url: string, body?: unknown): Promise<T> =>
  sessionRequest(
    requests.json<T>(url, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf.value },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  );
const knowledgeApi = <T,>(url: string, body?: unknown): Promise<T> =>
  sessionRequest(
    knowledgeRequests.json<T>(url, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf.value },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  );
async function sessionRequest<T>(request: Promise<T>): Promise<T> {
  try {
    return await request;
  } catch (cause) {
    if (cause instanceof ConsoleRequestError && cause.code === "ADMIN_SESSION_EXPIRED")
      clearSession();
    throw cause;
  }
}
function resetSourceForm() {
  sourceReplacement.value = undefined;
  replacementConfirmed.value = false;
  Object.assign(sourceForm, {
    name: "",
    purpose: "",
    environment: "desenvolvimento",
    agentId: "",
    clientToken: "",
    password: "",
    email: "",
    dialect: "mssql",
  });
}
function areaDirty(current: ConsoleArea) {
  if (current === "operations") return notificationsDirty.value || operationActionsDirty.value;
  return current === "training"
    ? dirty.value ||
        queryCaseDirty.value ||
        trainingKnowledgeDirty.value ||
        !!reviewDate.value ||
        operationSkillDirty.value ||
        federationSkillDirty.value ||
        externalSkillDirty.value
    : current === "knowledge"
      ? sourceKnowledgeDirty.value || explorerDirty.value || knowledgeMaintenanceDirty.value
      : current === "sources"
        ? sourceDirty.value ||
          Object.values(sourcesDirty).some(Boolean) ||
          Object.values(sourceLifecycleDirty).some(Boolean)
        : current === "overview"
          ? settingsDirty.value
          : current === "personas"
            ? newPersonaDirty.value
            : current === "tokens"
              ? tokenDirty.value
              : current === "catalog"
                ? knowledgeDirty.value
                : current === "queries"
                  ? federationDirty.value
                  : current === "integrations"
                    ? externalTestsDirty.value ||
                      externalActionsDirty.value ||
                      integrationManagementDirty.value
                    : false;
}
function discardArea(current: ConsoleArea) {
  if (current === "operations") {
    operationActionsDirty.value = false;
    operationActionsKey.value++;
    notificationsDirty.value = false;
    notificationsKey.value++;
  }
  if (current === "integrations") {
    integrationManagementDirty.value = false;
    integrationManagementKey.value++;
    externalActionsDirty.value = false;
    externalActionsKey.value++;
    externalTestsDirty.value = false;
    externalTestsKey.value++;
  }
  if (current === "knowledge") {
    sourceKnowledgeDirty.value = false;
    explorerDirty.value = false;
    knowledgeMaintenanceDirty.value = false;
    sourceKnowledgeKey.value++;
  }
  if (current === "queries") {
    federationDirty.value = false;
    federationKey.value++;
  }
  if (current === "training") resetTraining();
  if (current === "sources") {
    resetSourceForm();
    sourceOpen.value = false;
    for (const id of Object.keys(sourcesDirty)) {
      sourcesDirty[id] = false;
      sourceFormVersions[id] = (sourceFormVersions[id] ?? 0) + 1;
    }
    for (const id of Object.keys(sourceLifecycleDirty)) sourceLifecycleDirty[id] = false;
  }
  if (current === "overview") {
    settingsDirty.value = false;
    settingsKey.value++;
  }
  if (current === "personas")
    Object.assign(personaForm, { name: "", specialty: "", instructions: "" });
  if (current === "tokens") {
    oauthConnectionsDirty.value = false;
    oauthConnectionsKey.value++;
    resetTokenLimits();
    tokenName.value = "";
    tokenAdministrative.value = [];
    tokenAdministrativeSources.value = [];
    tokenManagedIntegrations.value = [];
    tokenCanDelegate.value = false;
    delegationDirty.value = false;
    delegationKey.value++;
    selectedSkills.value = [];
    tokenNoExpiry.value = false;
    tokenDays.value = 30;
    tokenManagerDirty.value = false;
    tokenManagerKey.value++;
  }
  if (current === "catalog") {
    knowledgeKey.value++;
    knowledgeDirty.value = false;
    knowledgeRequests.reset();
  }
}
const stopNavigation = router.beforeEach(async (to, from) => {
  if (busy.value || dialogOpen.value) return false;
  if (logged.value && to.name !== from.name && areaDirty(from.name as ConsoleArea)) {
    if (!(await confirmDiscard())) return false;
    discardArea(from.name as ConsoleArea);
  }
  menuOpen.value = false;
  error.value = "";
  errorFields.value = [];
  message.value = "";
  if (to.name !== "queries") {
    clearAttachment();
    result.value = undefined;
    querySql.value = "";
    Object.keys(queryValues).forEach((key) => delete queryValues[key]);
    Object.keys(queryModes).forEach((key) => delete queryModes[key]);
  }
  if (!["tokens", "queries", "knowledge"].includes(String(to.name))) {
    bearer.value = "";
    showBearer.value = false;
  }
  if (logged.value && !personaId.value && !["personas", "catalog"].includes(String(to.name)))
    return { name: "personas" };
  if (
    persona.value &&
    !persona.value.active &&
    !["personas", "catalog", "overview", "history"].includes(String(to.name))
  ) {
    return { name: "overview" };
  }
  return true;
});
const run = async (action: () => Promise<void>) => {
  if (busy.value) {
    return;
  }
  busy.value = true;
  errorArea.value = area.value;
  error.value = "";
  errorFields.value = [];
  message.value = "";
  try {
    await action();
  } catch (cause) {
    if (cause instanceof ConsoleRequestError && cause.code === "ADMIN_SESSION_EXPIRED")
      clearSession();
    error.value = cause instanceof Error ? cause.message : "Não foi possível concluir.";
    errorFields.value =
      cause instanceof ConsoleRequestError
        ? cause.fields.filter((field) => fieldLabels[field])
        : [];
  } finally {
    busy.value = false;
    // Disabled fields cannot receive focus: release the submission lock first.
    if (error.value) {
      await nextTick();
      if (errorFields.value.length) focusErrorField(errorFields.value[0]);
      else document.querySelector<HTMLElement>(".area-error")?.focus();
    }
  }
};
function resetTraining() {
  queryCaseDirty.value = false;
  queryTestsKey.value++;
  externalSkillDirty.value = false;
  externalSkillKey.value++;
  federationSkillDirty.value = false;
  federationSkillKey.value++;
  operationSkillDirty.value = false;
  operationSkillKey.value++;
  reviewDate.value = "";
  trainingKnowledgeDirty.value = false;
  trainingKnowledgeKey.value++;
  training.value = emptyTraining();
  name.value = "";
  slug.value = "";
  draftId.value = "";
  revision.value = 0;
  saved.value = fingerprint.value;
  preview.value = undefined;
  confirmed.value = false;
}
function clearPersona() {
  importedDraftFocus.value = undefined;
  clearAttachment();
  operationActionsDirty.value = false;
  operationActionsKey.value++;
  externalActionsDirty.value = false;
  externalActionsKey.value++;
  oauthConnectionsDirty.value = false;
  oauthConnectionsKey.value++;
  notificationsDirty.value = false;
  notificationsKey.value++;
  externalTestsDirty.value = false;
  externalTestsKey.value++;
  integrationManagementDirty.value = false;
  integrationManagementKey.value++;
  sourceKnowledgeDirty.value = false;
  explorerDirty.value = false;
  knowledgeMaintenanceDirty.value = false;
  sourceKnowledgeKey.value++;
  federationDirty.value = false;
  federationKey.value++;
  tokenManagerDirty.value = false;
  tokenManagerKey.value++;
  settingsDirty.value = false;
  Object.keys(sourcesDirty).forEach((id) => {
    delete sourcesDirty[id];
  });
  Object.keys(sourceLifecycleDirty).forEach((id) => delete sourceLifecycleDirty[id]);
  highlightedSourceId.value = "";
  Object.keys(sourceFormVersions).forEach((id) => {
    delete sourceFormVersions[id];
  });
  sources.value = [];
  drafts.value = [];
  publications.value = {};
  additionalPublications.value = {};
  selectedSkills.value = [];
  resetTokenLimits();
  bearer.value = "";
  tokenName.value = "";
  tokenAdministrative.value = [];
  tokenAdministrativeSources.value = [];
  tokenManagedIntegrations.value = [];
  tokenCanDelegate.value = false;
  delegationDirty.value = false;
  delegationKey.value++;
  tokenNoExpiry.value = false;
  tokenDays.value = 30;
  grantedQueries.value = undefined;
  querySkill.value = "";
  querySql.value = "";
  result.value = undefined;
  Object.keys(queryValues).forEach((key) => {
    delete queryValues[key];
  });
  Object.keys(queryModes).forEach((key) => delete queryModes[key]);
  resetTraining();
  resetSourceForm();
  sourceOpen.value = false;
  showBearer.value = false;
}
function clearSession() {
  uncertainIssuance.value = {};
  requests.reset();
  knowledgeRequests.reset();
  answerDiscard(false);
  knowledgeDirty.value = false;
  window.clearTimeout(expiration);
  window.clearTimeout(warningTimer);
  expiresSoon.value = false;
  logged.value = false;
  csrf.value = "";
  password.value = "";
  loadedPersonaId.value = "";
  personas.value = [];
  personaId.value = "";
  clearPersona();
  Object.assign(personaForm, { name: "", specialty: "", instructions: "" });
  Object.assign(sourceForm, { name: "", purpose: "", environment: "desenvolvimento", agentId: "" });
}
async function readPersonaData(id: string) {
  const base = `/api/admin/personas/${id}`;
  const [s, d] = await Promise.all([
    api<{ fontes: Source[] }>(`${base}/fontes`),
    api<{ skills: Draft[] }>(`${base}/skills`),
  ]);
  const published: Record<string, Publication> = {};
  for (const draft of d.skills.filter(
    (item) => item.kind === "consulta" && item.activePublicationId,
  )) {
    const p = await api<{ publication: Publication | null }>(
      `${base}/skills/${draft.id}/publicacao`,
    );
    if (p.publication) {
      published[draft.id] = p.publication;
    }
  }
  const crossings: Record<string, GrantPublication> = {};
  for (const draft of d.skills.filter(
    (item) =>
      (item.kind === "cruzamento" || item.kind === "operacao_sql") && item.activePublicationId,
  )) {
    const response = await api<{ publication: GrantPublication | null }>(
      `${base}/skills/${draft.id}/publicacao`,
    );
    if (response.publication) crossings[draft.id] = response.publication;
  }
  for (const draft of d.skills.filter(
    (item) => item.kind === "acao_externa" && item.activePublicationId,
  )) {
    const response = await api<{ publication: GrantPublication | null }>(
      `${base}/integracoes/skills/${draft.id}/rascunho`,
    );
    if (response.publication) crossings[draft.id] = response.publication;
  }
  return {
    sources: s.fontes,
    drafts: d.skills,
    publications: published,
    additionalPublications: crossings,
  };
}
function applyPersonaData(id: string, data: Awaited<ReturnType<typeof readPersonaData>>) {
  if (personaId.value !== id) return;
  sources.value = data.sources;
  drafts.value = data.drafts;
  publications.value = data.publications;
  additionalPublications.value = data.additionalPublications;
  selectedSkills.value = selectedSkills.value.filter((id) => tokenPublications.value[id]);
  if (querySkill.value && !data.publications[querySkill.value]) {
    querySkill.value = "";
    result.value = undefined;
  }
  loadedPersonaId.value = id;
}
async function load() {
  const id = personaId.value;
  if (!persona.value?.active) {
    loadedPersonaId.value = id;
    return;
  }
  applyPersonaData(id, await readPersonaData(id));
}
async function openImportedDraft(reference: ImportedDraftReference) {
  let opened = false;
  await run(async () => {
    if (anyDirty.value && !(await confirmDiscard())) return;
    if (!logged.value) return;
    const latest = await api<{ personas: Persona[] }>("/api/admin/personas");
    const target = latest.personas.find((p) => p.id === reference.personaId && p.active);
    if (!target)
      throw new Error("A persona de destino está indisponível. A edição atual foi preservada.");
    const data = await readPersonaData(target.id);
    const draft = data.drafts.find((d) => d.id === reference.skillId && d.kind === "consulta");
    if (!draft)
      throw new Error("O treinamento criado está indisponível. A edição atual foi preservada.");
    // Finish authorized reads before discarding anything or unmounting child editors.
    requests.reset();
    clearPersona();
    discardArea("catalog");
    Object.assign(personaForm, { name: "", specialty: "", instructions: "" });
    personas.value = latest.personas;
    personaId.value = target.id;
    applyPersonaData(target.id, data);
    selectDraft(draft);
    opened = true;
  });
  if (
    !opened ||
    !logged.value ||
    personaId.value !== reference.personaId ||
    draftId.value !== reference.skillId
  )
    return;
  await router.push({ name: "training" });
  if (area.value === "training") importedDraftFocus.value = reference;
}
watch(
  [importedDraftFocus, busy, area, personaId, draftId],
  async () => {
    const target = importedDraftFocus.value;
    if (!target) return;
    const current = () =>
      importedDraftFocus.value === target &&
      logged.value &&
      area.value === "training" &&
      personaId.value === target.personaId &&
      draftId.value === target.skillId;
    if (!current()) {
      importedDraftFocus.value = undefined;
      return;
    }
    if (busy.value) return;
    await nextTick();
    if (!current() || busy.value) return;
    const input = document.querySelector<HTMLElement>('[data-error-field="training:name"]');
    if (input && !input.matches(":disabled") && input.getClientRects().length) {
      input.focus();
      importedDraftFocus.value = undefined;
    }
  },
  { flush: "post" },
);
async function login() {
  await run(async () => {
    try {
      const session = await api<{ csrfToken: string; expiresAt: string }>("/api/admin/login", {
        email: email.value,
        password: password.value,
      });
      csrf.value = session.csrfToken;
      personas.value = (await api<{ personas: Persona[] }>("/api/admin/personas")).personas;
      logged.value = true;
      warningTimer = window.setTimeout(
        () => {
          expiresSoon.value = true;
        },
        Math.max(0, Date.parse(session.expiresAt) - Date.now() - 120000),
      );
      expiration = window.setTimeout(
        () => {
          clearSession();
          message.value = "Sua sessão expirou. Entre novamente.";
        },
        Math.max(0, Date.parse(session.expiresAt) - Date.now()),
      );
    } finally {
      password.value = "";
    }
  });
}
async function logout() {
  if (anyDirty.value && !(await confirmDiscard())) return;
  await run(async () => {
    try {
      await api("/api/admin/logout", {});
    } finally {
      clearSession();
    }
  });
}
async function choosePersona(event: Event) {
  const select = event.target as HTMLSelectElement;
  const nextId = select.value;
  if (personaDirty.value && !(await confirmDiscard())) {
    personaId.value = loadedPersonaId.value;
    select.value = loadedPersonaId.value;
    return;
  }
  requests.reset();
  clearPersona();
  personaId.value = nextId;
  if (personaId.value) {
    await run(load);
  }
  if (persona.value && !persona.value.active) {
    await router.push({ name: "overview" });
  }
}
async function createPersona() {
  await run(async () => {
    if (personaDirty.value && !(await confirmDiscard())) {
      return;
    }
    const response = await api<{ persona: Persona }>("/api/admin/personas", personaForm);
    personas.value.push(response.persona);
    clearPersona();
    personaId.value = response.persona.id;
    Object.assign(personaForm, { name: "", specialty: "", instructions: "" });
    await load();
    personaOpen.value = false;
    message.value = "Persona criada. A base comum de SQL e plug_server já está disponível.";
  });
  if (personaId.value && !error.value) await router.push({ name: "overview" });
}
async function addSource() {
  if (sourceReplacement.value && !replacementConfirmed.value) return;
  await run(async () => {
    const replacement = sourceReplacement.value;
    try {
      const response = await api<{ fonte: Source }>(
        replacement ? `${path()}/fontes/${replacement.id}/substituir` : `${path()}/fontes`,
        replacement ? { expectedVersion: replacement.version, source: sourceForm } : sourceForm,
      );
      if (replacement)
        sourceFormVersions[replacement.id] = (sourceFormVersions[replacement.id] ?? 0) + 1;
      await load();
      resetSourceForm();
      sourceOpen.value = false;
      highlightedSourceId.value = response.fonte.id;
      message.value = replacement
        ? "Nova base verificada. O vínculo anterior ficou no histórico; treine, publique e conceda acesso explicitamente à substituta."
        : "Base conectada. Agora cadastre o treinamento dessa fonte.";
      await nextTick();
      document.getElementById(`source-${response.fonte.id}`)?.focus();
    } finally {
      sourceForm.password = "";
      sourceForm.email = "";
      sourceForm.clientToken = "";
    }
  });
}
async function beginSourceReplacement(source: Source) {
  sourceLifecycleDirty[source.id] = false;
  if ((sourceDirty.value || sourcesDirty[source.id]) && !(await confirmDiscard())) return;
  if (sourcesDirty[source.id]) {
    sourcesDirty[source.id] = false;
    sourceFormVersions[source.id] = (sourceFormVersions[source.id] ?? 0) + 1;
  }
  resetSourceForm();
  Object.assign(sourceForm, {
    name: source.name,
    purpose: source.purpose,
    environment: source.environment,
    dialect: source.dialect,
  });
  sourceReplacement.value = {
    id: source.id,
    version: source.authorizationVersion,
    name: source.name,
  };
  sourceOpen.value = true;
  await nextTick();
  document.getElementById("source-registration")?.focus();
}
async function cancelSourceReplacement() {
  if (sourceDirty.value && !(await confirmDiscard())) return;
  resetSourceForm();
  sourceOpen.value = false;
}
async function changeSourceState(sourceId: string, active: boolean, input: unknown) {
  sourceLifecycleDirty[sourceId] = false;
  if (sourcesDirty[sourceId] && !(await confirmDiscard())) return;
  await run(async () => {
    result.value = undefined;
    preview.value = undefined;
    confirmed.value = false;
    let changed = false;
    try {
      await api(`${path()}/fontes/${sourceId}/${active ? "recuperar" : "suspender"}`, input);
      changed = true;
    } finally {
      await load();
      if (changed) {
        sourcesDirty[sourceId] = false;
        sourceFormVersions[sourceId] = (sourceFormVersions[sourceId] ?? 0) + 1;
      }
    }
    message.value = active
      ? "Mesma base confirmada e vínculo recuperado. Revise e publique novamente as skills; nenhuma permissão nova foi concedida."
      : "Fonte suspensa, incluindo publicações e cruzamentos dependentes. As outras fontes continuam independentes.";
  });
}
async function savePersona(input: unknown) {
  await run(async () => {
    const response = await api<{ persona: Persona }>(`${path()}/editar`, input);
    personas.value = personas.value.map((p) =>
      p.id === response.persona.id ? response.persona : p,
    );
    settingsDirty.value = false;
    preview.value = undefined;
    confirmed.value = false;
    result.value = undefined;
    message.value = "Persona atualizada. As permissões dos tokens continuam explícitas.";
  });
}
async function changePersonaState(active: boolean) {
  if (personaDirty.value && !(await confirmDiscard())) {
    return;
  }
  const selected = persona.value;
  if (!selected) {
    return;
  }
  await run(async () => {
    const response = await api<{ persona: Persona }>(
      `${path()}/${active ? "recuperar" : "suspender"}`,
      {
        expectedVersion: selected.authorizationVersion,
      },
    );
    requests.reset();
    clearPersona();
    personas.value = personas.value.map((p) => (p.id === selected.id ? response.persona : p));
    await load();
    message.value = active
      ? "Persona recuperada. Revise e publique novamente as skills; conexões revogadas permanecem revogadas."
      : "Persona suspensa. Publicações suspensas e conexões derivadas revogadas.";
  });
  if (!error.value) {
    await router.push({ name: "overview" });
  }
}
async function saveSource(sourceId: string, input: unknown, rotate = false) {
  await run(async () => {
    preview.value = undefined;
    confirmed.value = false;
    result.value = undefined;
    try {
      await api(`${path()}/fontes/${sourceId}/${rotate ? "credencial" : "editar"}`, input);
    } catch (cause) {
      // A conflict needs explicit reload: a background request must not delay or
      // replace its error, nor silently refresh the context of a pending edit.
      if (!(cause instanceof ConsoleRequestError && cause.code === "OPERATION_CONFLICT"))
        await load();
      throw cause;
    }
    sourcesDirty[sourceId] = false;
    await load();
    sourceFormVersions[sourceId] = (sourceFormVersions[sourceId] ?? 0) + 1;
    message.value = rotate
      ? "Credenciais verificadas e trocadas. Revise e publique novamente o treinamento desta fonte."
      : "Base atualizada. Revise e publique novamente o treinamento desta fonte.";
  });
}
async function reloadSource(sourceId: string) {
  if ((sourcesDirty[sourceId] || sourceLifecycleDirty[sourceId]) && !(await confirmDiscard())) {
    return;
  }
  await run(async () => {
    await load();
    sourcesDirty[sourceId] = false;
    sourceLifecycleDirty[sourceId] = false;
    sourceFormVersions[sourceId] = (sourceFormVersions[sourceId] ?? 0) + 1;
  });
}
async function editDraft(event: Event) {
  const id = (event.target as HTMLSelectElement).value;
  if (
    (dirty.value || queryCaseDirty.value || trainingKnowledgeDirty.value || !!reviewDate.value) &&
    !(await confirmDiscard())
  ) {
    (event.target as HTMLSelectElement).value = draftId.value;
    return;
  }
  const draft = drafts.value.find((d) => d.id === id);
  selectDraft(draft);
}
async function reloadTraining() {
  if (!draftId.value || busy.value || dialogOpen.value) return;
  const ownerId = personaId.value,
    selectedId = draftId.value;
  if (
    (dirty.value || queryCaseDirty.value || trainingKnowledgeDirty.value || !!reviewDate.value) &&
    !(await confirmDiscard())
  )
    return;
  await run(async () => {
    const data = await readPersonaData(ownerId);
    if (personaId.value !== ownerId || draftId.value !== selectedId) return;
    const draft = data.drafts.find((item) => item.id === selectedId && item.kind === "consulta");
    if (!draft) throw new Error("Treinamento indisponível. A edição local foi preservada.");
    applyPersonaData(ownerId, data);
    selectDraft(draft);
    message.value = "Treinamento recarregado do servidor. Revise antes de salvar ou publicar.";
  });
}
function selectDraft(draft?: Draft) {
  resetTraining();
  if (draft) {
    training.value = JSON.parse(JSON.stringify(draft.training)) as Training;
    name.value = draft.name;
    slug.value = draft.slug;
    draftId.value = draft.id;
    revision.value = draft.revision;
    saved.value = fingerprint.value;
  }
}
watch(fingerprint, () => {
  preview.value = undefined;
  confirmed.value = false;
});
async function changeTrainingSource(event: Event) {
  const input = event.target as HTMLSelectElement,
    nextSource = input.value,
    currentTraining = training.value,
    currentPersona = personaId.value;
  input.value = currentTraining.sourceId;
  if (nextSource === currentTraining.sourceId) return;
  if (
    (trainingKnowledgeDirty.value || currentTraining.sharedKnowledge) &&
    !(await confirmDiscard())
  )
    return;
  if (
    busy.value ||
    personaId.value !== currentPersona ||
    training.value !== currentTraining ||
    !sources.value.some((source) => source.id === nextSource && source.active)
  )
    return;
  delete currentTraining.sharedKnowledge;
  trainingKnowledgeDirty.value = false;
  trainingKnowledgeKey.value++;
  currentTraining.sourceId = nextSource;
}
watch(
  () => training.value.sourceId,
  (id) => {
    const source = sources.value.find((s) => s.id === id);
    if (source) {
      training.value.dialect = source.dialect;
    }
  },
);
watch(querySkill, () => {
  Object.keys(queryModes).forEach((key) => delete queryModes[key]);
  querySql.value = "";
  result.value = undefined;
  Object.keys(queryValues).forEach((key) => {
    delete queryValues[key];
  });
});
watch(
  [querySql, bearer, queryValues],
  () => {
    result.value = undefined;
  },
  { deep: true },
);
async function saveTraining() {
  await run(async () => {
    const response = draftId.value
      ? await api<{ skill: Draft }>(`${path()}/skills/${draftId.value}/rascunho`, {
          name: name.value,
          training: training.value,
          expectedRevision: revision.value,
        })
      : await api<{ skill: Draft }>(`${path()}/skills`, {
          name: name.value,
          slug: slug.value,
          kind: "consulta",
          training: training.value,
        });
    draftId.value = response.skill.id;
    revision.value = response.skill.revision;
    saved.value = fingerprint.value;
    await load();
    message.value = "Rascunho salvo. Revise o pacote antes de publicar.";
  });
}
async function previewTraining() {
  await run(async () => {
    preview.value = await api<Preview>(`${path()}/skills/${draftId.value}/preview`, {
      reviewDueAt: publicationDeadline(reviewDate.value),
    });
    confirmed.value = false;
  });
}
async function publishTraining() {
  await run(async () => {
    if (
      !preview.value ||
      !confirmed.value ||
      dirty.value ||
      Date.parse(preview.value.expiresAt) <= Date.now()
    ) {
      throw new Error("Revise um preview atual antes de publicar.");
    }
    await api(`${path()}/skills/${draftId.value}/publicar`, {
      confirmationHash: preview.value.confirmationHash,
    });
    reviewDate.value = "";
    preview.value = undefined;
    confirmed.value = false;
    await load();
    message.value = "Treinamento publicado. Libere seu uso em um token.";
  });
}
async function issueToken() {
  if (issuanceRecovery.value) return;
  await run(async () => {
    const chosen = selectedSkills.value
      .map((id) => ({ id, publication: tokenPublications.value[id] }))
      .filter((p) => p.publication);
    if (!chosen.length && !tokenAdministrative.value.length) {
      throw new Error("Selecione pelo menos uma capacidade publicada.");
    }
    for (const { publication } of chosen)
      for (const dependency of publication.package.dependencies ?? []) {
        if (
          !chosen.some(
            (item) =>
              item.id === dependency.skillId &&
              item.publication.id === dependency.publicationId &&
              item.publication.hash === dependency.hash,
          )
        )
          throw new Error(
            "Selecione explicitamente todas as consultas dependentes do cruzamento, nas versões publicadas exigidas.",
          );
      }
    const empty = { sourceIds: [], skills: [], externalOperationIds: [], administrative: [] };
    const permissions = {
      ...empty,
      ...tokenLimits.value,
      administrative: tokenAdministrative.value,
      managedIntegrationIds: tokenAdministrative.value.includes("gerenciar_integracoes")
        ? tokenManagedIntegrations.value
        : [],
      externalOperationIds: [
        ...new Set(chosen.flatMap((p) => publicationExternalOperations(p.publication))),
      ],
      sourceIds: [
        ...new Set([
          ...tokenAdministrativeSources.value,
          ...chosen.flatMap((p) =>
            p.publication.package.sourceId
              ? [p.publication.package.sourceId]
              : (p.publication.package.dependencies ?? []).map((d) => d.sourceId),
          ),
        ]),
      ],
      skills: chosen.map((p) => ({
        ...tokenSkillLimits.value[p.id],
        ...publicationGrant(p.id, p.publication),
      })),
    };
    const ownerPersona = personaId.value;
    const issued = await api<{ bearer: string }>(`${path()}/tokens`, {
      name: tokenName.value,
      expiresAt: tokenNoExpiry.value
        ? null
        : new Date(Date.now() + tokenDays.value * 86400000).toISOString(),
      delegation: tokenCanDelegate.value ? permissions : empty,
      permissions,
    }).catch((cause: unknown) => {
      if (cause instanceof ConsoleRequestError && cause.code === "RESPONSE_UNCONFIRMED") {
        uncertainIssuance.value[ownerPersona] = { checked: false, tokens: [] };
        bearer.value = "";
        tokenRefresh.value++;
      }
      throw cause;
    });
    tokenRefresh.value++;
    bearer.value = issued.bearer;
    showBearer.value = false;
    tokenName.value = "";
    tokenAdministrative.value = [];
    tokenAdministrativeSources.value = [];
    tokenManagedIntegrations.value = [];
    tokenCanDelegate.value = false;
    tokenNoExpiry.value = false;
    tokenDays.value = 30;
    selectedSkills.value = [];
    resetTokenLimits();
    message.value = "Token emitido. Copie agora; ele fica somente na memória desta página.";
  });
}
async function inspectUncertainIssuance() {
  if (!issuanceRecovery.value) return;
  issuanceRecovery.value.checked = false;
  await run(async () => {
    const result = await api<{ tokens: { id: string; name: string; revokedAt: string | null }[] }>(
      `${path()}/tokens`,
    );
    if (!issuanceRecovery.value) return;
    issuanceRecovery.value.tokens = result.tokens.map(({ id, name, revokedAt }) => ({
      id,
      name,
      revokedAt,
    }));
    issuanceRecovery.value.checked = true;
    tokenRefresh.value++;
  });
}
function startNewIssuance() {
  if (busy.value || !issuanceRecovery.value?.checked) return;
  if (
    !window.confirm(
      "A emissão anterior pode ter sido concluída. Confira e revogue o token sem segredo na lista, se necessário. Iniciar uma nova emissão explícita?",
    )
  )
    return;
  delete uncertainIssuance.value[personaId.value];
  tokenName.value = "";
  selectedSkills.value = [];
  tokenAdministrative.value = [];
  tokenAdministrativeSources.value = [];
  tokenManagedIntegrations.value = [];
  tokenCanDelegate.value = false;
  resetTokenLimits();
}
async function mcp<T>(tool: string, args: unknown): Promise<T> {
  const response = await requests.json<{
    result?: { isError?: boolean; content: { text?: string }[] };
    error?: unknown;
  }>(
    "/mcp",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${bearer.value}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: tool, arguments: args },
      }),
    },
    "mcp",
  );
  let value: { error?: { message?: string } } | null;
  try {
    value = JSON.parse(response.result?.content[0]?.text ?? "null") as typeof value;
  } catch {
    throw new Error(
      "Resposta inválida do MCP. Verifique o estado; não repita ações com possível efeito.",
    );
  }
  if (!response.result || response.result.isError) {
    throw new Error(
      value?.error?.message ?? "Solicitação recusada. Confira treinamento, fonte e permissões.",
    );
  }
  return value as T;
}
async function inspectToken() {
  await run(async () => {
    grantedQueries.value = undefined;
    result.value = undefined;
    const context = await mcp<Persona>("obter_contexto_persona", {});
    if (context.id !== personaId.value) throw new Error("Este token pertence a outra persona.");
    grantedQueries.value = await mcp<NonNullable<typeof grantedQueries.value>>("listar_skills", {});
    if (!queryPublications.value[querySkill.value]) querySkill.value = "";
    message.value =
      "Consultas filtradas pelas publicações concedidas ao token. O servidor revalida todas as permissões a cada execução.";
  });
}
async function query(validation = false, page = 1) {
  await run(async () => {
    clearAttachment();
    result.value = undefined;
    const selected = active.value;
    if (!selected || !bearer.value) {
      throw new Error("Escolha uma consulta e informe o token.");
    }
    const context = await mcp<Persona>("obter_contexto_persona", {});
    if (context.id !== personaId.value) {
      throw new Error("Este token pertence a outra persona.");
    }
    const permitted = await mcp<{ id: string; publicationId: string; hash: string }[]>(
      "listar_skills",
      {},
    );
    if (
      !permitted.some(
        (item) =>
          item.id === querySkill.value &&
          item.publicationId === selected.id &&
          item.hash === selected.hash,
      )
    )
      throw new Error(
        "Esta publicação não está concedida ao token atual. Confira as consultas permitidas.",
      );
    const params = queryParameters(selected.package.training.parameters, queryValues, queryModes);
    const response = await mcp<QueryResult>(validation ? "validar_consulta" : "consultar_dados", {
      fonteId: selected.package.sourceId,
      skillIds: [querySkill.value],
      ...(querySql.value.trim() ? { sql: querySql.value } : {}),
      params,
      options: {
        maxRows: 100,
        timeoutMs: 30000,
        ...(validation ? {} : { page, pageSize: queryPageSize.value }),
      },
    });
    if (validation) {
      message.value =
        "SQL validado tecnicamente. Essa validação não retorna dados nem aprova o significado da consulta.";
    } else {
      queryPage.value = page;
      submittedFilters.value = params;
      result.value = response;
    }
  });
}
function toggleAttachments(event: Event) {
  if ((event.target as HTMLInputElement).checked) {
    training.value.attachments = { format: "json", maxBytes: 1048576, ttlMs: 300000 };
  } else delete training.value.attachments;
}
async function createAttachment(format: "json" | "binary" = "json") {
  await run(async () => {
    clearAttachment();
    const selected = active.value;
    if (
      !selected ||
      !(format === "binary"
        ? selected.package.training.binaryAttachments
        : selected.package.training.attachments) ||
      !bearer.value
    )
      throw new Error("Selecione uma publicação com anexos e token autorizado.");
    const context = await mcp<Persona>("obter_contexto_persona", {});
    if (context.id !== personaId.value) throw new Error("Este token pertence a outra persona.");
    const params = queryParameters(selected.package.training.parameters, queryValues, queryModes);
    attachment.value = await mcp<AttachmentDescriptor>("criar_anexo_consulta", {
      format,
      query: {
        fonteId: selected.package.sourceId,
        skillIds: [querySkill.value],
        sql: querySql.value.trim() || undefined,
        params,
        options:
          format === "binary"
            ? { maxRows: 2 }
            : { page: queryPage.value, pageSize: queryPageSize.value },
      },
    });
    message.value =
      "Anexo criado por nova consulta; validade e permissões serão conferidas novamente ao baixar.";
  });
}
async function downloadAttachment() {
  await run(async () => {
    const selected = attachment.value;
    if (!selected || !bearer.value) throw new Error("Crie um anexo autorizado antes de baixar.");
    const currentContext = personaId.value;
    const controller = new AbortController();
    attachmentDownload = controller;
    const timer = window.setTimeout(() => controller.abort(), 60000);
    try {
      const response = await fetch(
        `/api/consumer/bearer/attachments/${encodeURIComponent(selected.handle)}`,
        {
          headers: { Authorization: `Bearer ${bearer.value}` },
          signal: controller.signal,
          cache: "no-store",
          credentials: "omit",
        },
      );
      if (!response.ok) throw new Error("Download recusado; confira prazo, conexão e permissões.");
      const bytes = await response.arrayBuffer();
      if (
        !logged.value ||
        personaId.value !== currentContext ||
        attachment.value?.handle !== selected.handle
      )
        return;
      if (Date.parse(selected.expiresAt) <= Date.now() || bytes.byteLength !== selected.bytes)
        throw new Error("Anexo expirado ou resposta incompatível.");
      const url = URL.createObjectURL(new Blob([bytes], { type: selected.mimeType }));
      const link = document.createElement("a");
      try {
        link.href = url;
        link.download = selected.filename;
        link.click();
      } finally {
        URL.revokeObjectURL(url);
      }
      message.value = "Download autorizado. O arquivo preserva o horário da consulta original.";
    } finally {
      window.clearTimeout(timer);
      if (attachmentDownload === controller) attachmentDownload = undefined;
    }
  });
}
function addTable() {
  training.value.tables.push({ name: "", meaning: "", grain: [] });
}
function addColumn() {
  training.value.columns.push({
    table: training.value.tables[0]?.name ?? "",
    name: "",
    meaning: "",
    classification: "livre",
  });
}
function addRelationship() {
  let index = 1;
  while (training.value.relationships.some((r) => r.id === `relacao_${index}`)) index++;
  training.value.relationships.push({
    id: `relacao_${index}`,
    from: "",
    to: "",
    keys: [{ from: "", to: "" }],
    join: "inner",
    cardinality: "N:1",
    meaning: "",
  });
}
function addParameter() {
  training.value.parameters.push({ name: "", type: "string", required: true, meaning: "" });
}
function addExample() {
  training.value.examples ??= [];
  training.value.examples.push({
    id: "",
    purpose: "",
    sql: "",
    explanation: "",
    state: "candidate",
  });
}
function changeExampleState(example: NonNullable<Training["examples"]>[number], event: Event) {
  example.state = (event.target as HTMLSelectElement).value as NonNullable<typeof example.state>;
}
function split(value: string) {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
function cell(value: unknown) {
  return value == null
    ? "—"
    : typeof value === "object"
      ? JSON.stringify(value)
      : typeof value === "string" || typeof value === "number" || typeof value === "boolean"
        ? String(value)
        : "Valor não exibível";
}
function revealBearer() {
  window.clearTimeout(revealTimer);
  showBearer.value = !showBearer.value;
  if (showBearer.value)
    revealTimer = window.setTimeout(() => {
      showBearer.value = false;
    }, 30000);
}
watch(bearer, () => {
  grantedQueries.value = undefined;
  showBearer.value = false;
  window.clearTimeout(revealTimer);
});
async function copyBearer() {
  await run(async () => {
    await navigator.clipboard.writeText(bearer.value);
    message.value = "Token copiado. Guarde-o em local seguro.";
  });
}
watch(
  [querySkill, querySql, bearer, queryValues, queryModes, queryPageSize],
  () => {
    clearAttachment();
    result.value = undefined;
    queryPage.value = 1;
    submittedFilters.value = {};
  },
  { deep: true },
);
const beforeUnload = (event: BeforeUnloadEvent) => {
  if (anyDirty.value) {
    event.preventDefault();
  }
};
window.addEventListener("beforeunload", beforeUnload);
onBeforeUnmount(() => {
  clearAttachment();
  stopNavigation();
  window.removeEventListener("beforeunload", beforeUnload);
  window.clearTimeout(expiration);
  window.clearTimeout(warningTimer);
  window.clearTimeout(revealTimer);
  answerDiscard(false);
  requests.reset();
  knowledgeRequests.reset();
});
</script>

<template>
  <main>
    <header>
      <div class="brand">
        <BrandLogo />
        <div>
          <h1>Se7e — Personas</h1>
          <p>Conecte bases e ensine sua persona a consultar informações.</p>
        </div>
      </div>
      <button v-if="logged" :disabled="busy" @click="logout">Sair</button>
    </header>
    <p class="notice">
      Ambiente de desenvolvimento. Publicação e deploy continuam bloqueados até o aceite completo.
    </p>
    <p v-if="error && !logged" role="alert" class="error area-error" tabindex="-1">{{ error }}</p>
    <p v-if="message" role="status" class="success">{{ message }}</p>
    <DiscardDialog v-if="dialogOpen" @answer="answerDiscard" />
    <p v-if="logged && expiresSoon" class="notice" role="status">
      Sua sessão termina em menos de dois minutos. Salve as edições pendentes.
    </p>
    <form v-if="!logged" @submit.prevent="login">
      <h2>Entre com sua conta Client</h2>
      <label>E-mail<input v-model="email" type="email" autocomplete="username" required /></label
      ><label
        >Senha<input
          v-model="password"
          type="password"
          autocomplete="current-password"
          required /></label
      ><button :disabled="busy">{{ busy ? "Entrando…" : "Entrar" }}</button>
    </form>
    <template v-else>
      <nav aria-label="Áreas do console">
        <button
          class="mobile-menu secondary"
          :aria-expanded="menuOpen"
          aria-controls="console-menu"
          @click="menuOpen = !menuOpen"
        >
          Menu
        </button>
        <div id="console-menu" class="console-menu" :class="{ expanded: menuOpen }">
          <RouterLink
            v-for="item in consoleAreas"
            :key="item.id"
            :to="{ name: item.id }"
            :aria-current="area === item.id ? 'page' : undefined"
            >{{ item.label }}</RouterLink
          >
        </div>
      </nav>
      <div v-if="error" role="alert" class="error area-error" tabindex="-1">
        <p>{{ error }}</p>
        <ul v-if="errorFields.length">
          <li v-for="field in errorFields" :key="field">
            <button type="button" class="secondary" @click="focusErrorField(field)">
              Confira {{ fieldLabels[field] }}
            </button>
          </li>
        </ul>
      </div>
      <SharedKnowledgePanel
        v-show="area === 'catalog'"
        :key="knowledgeKey"
        :api="knowledgeApi"
        :confirm-discard="confirmDiscard"
        :disabled="busy"
        @dirty="knowledgeDirty = $event"
        @lock="busy = $event"
        @open-draft="openImportedDraft"
      />
      <fieldset :disabled="busy">
        <label
          >Persona<select :value="personaId" @change="choosePersona">
            <option value="">Selecione</option>
            <option v-for="p in personas" :key="p.id" :value="p.id">
              {{ p.name }}{{ p.active ? "" : " (suspensa)" }}
            </option>
          </select></label
        >
      </fieldset>
      <p v-if="!personas.length && area === 'personas'" class="notice">
        Comece criando sua primeira persona. Você poderá conectar as bases depois.
      </p>
      <button v-if="!personas.length && area === 'personas'" @click="personaOpen = true">
        Criar primeira persona
      </button>
      <details
        v-show="area === 'personas'"
        :open="personaOpen"
        @toggle="personaOpen = ($event.target as HTMLDetailsElement).open"
      >
        <summary>Criar uma persona</summary>
        <form aria-label="Criar persona" @submit.prevent="createPersona">
          <fieldset :disabled="busy">
            <label
              >Nome<input
                v-model="personaForm.name"
                data-error-field="personas:name"
                :aria-invalid="invalidField('name') || undefined"
                :aria-describedby="invalidField('name') ? 'personas-name-error' : undefined"
                maxlength="200"
                required
            /></label>
            <p v-if="invalidField('name')" id="personas-name-error" class="error">
              Revise este campo.
            </p>
            <label
              >Especialidade<textarea
                v-model="personaForm.specialty"
                data-error-field="personas:specialty"
                :aria-invalid="invalidField('specialty') || undefined"
                :aria-describedby="
                  invalidField('specialty') ? 'personas-specialty-error' : undefined
                "
                maxlength="5000"
                required
              />
            </label>
            <p v-if="invalidField('specialty')" id="personas-specialty-error" class="error">
              Revise este campo.
            </p>
            <label
              >Orientações<textarea
                v-model="personaForm.instructions"
                data-error-field="personas:instructions"
                :aria-invalid="invalidField('instructions') || undefined"
                :aria-describedby="
                  invalidField('instructions') ? 'personas-instructions-error' : undefined
                "
                maxlength="20000"
              />
            </label>
            <p v-if="invalidField('instructions')" id="personas-instructions-error" class="error">
              Revise este campo.
            </p>
            <button>Criar persona</button>
          </fieldset>
        </form>
      </details>
      <template v-if="persona">
        <section v-show="area === 'overview'">
          <h2>{{ persona.name }}</h2>
          <p>{{ persona.specialty }}</p>
          <p>
            A base comum de SQL e uso do plug_server já está disponível. Cada fonte recebe seu
            próprio treinamento.
          </p>
          <PersonaState
            :key="`${persona.id}:${persona.authorizationVersion}`"
            :persona="persona"
            :busy="busy"
            @change="changePersonaState"
          />
          <ProgressPanel
            v-if="area === 'overview' && persona.active"
            :key="persona.id"
            :api="api"
            :base="path()"
          />
          <PersonaSettings
            v-if="persona.active"
            :key="`${persona.id}:${persona.authorizationVersion}:${settingsKey}`"
            :persona="persona"
            :busy="busy"
            @save="savePersona"
            @dirty="settingsDirty = $event"
          />
        </section>
        <section v-show="area === 'sources'">
          <h2>Bases conectadas</h2>
          <p v-if="!sources.length">Cadastre a primeira base desta persona.</p>
          <ul>
            <li
              v-for="s in sources"
              :id="`source-${s.id}`"
              :key="s.id"
              :class="{ notice: highlightedSourceId === s.id }"
              tabindex="-1"
            >
              <strong>{{ s.name }}</strong> — {{ s.purpose }} ({{ s.dialect }})
              <p>
                {{
                  s.replacedBySourceId
                    ? "Vínculo substituído"
                    : s.active
                      ? "Vínculo ativo"
                      : "Vínculo suspenso"
                }}
                · Banco: {{ s.database }}
                <span v-if="s.identityVerifiedAt"
                  >· Identidade conferida em
                  {{ new Date(s.identityVerifiedAt).toLocaleString() }}</span
                >
              </p>
              <SourceSettings
                :key="`${s.id}:${sourceFormVersions[s.id] ?? 0}`"
                :source="s"
                :busy="busy"
                :base="path()"
                :api="api"
                @lock="busy = $event"
                @save="saveSource(s.id, $event)"
                @rotate="saveSource(s.id, $event, true)"
                @dirty="sourcesDirty[s.id] = $event"
                @reload="reloadSource(s.id)"
              />
              <SourceLifecycle
                :key="`lifecycle:${s.id}:${sourceFormVersions[s.id] ?? 0}`"
                :source="s"
                :busy="busy"
                :base="path()"
                :api="api"
                @lock="busy = $event"
                @state="(active, input) => changeSourceState(s.id, active, input)"
                @replace="beginSourceReplacement(s)"
                @reload="reloadSource(s.id)"
                @dirty="sourceLifecycleDirty[s.id] = $event"
              />
            </li>
          </ul>
          <details
            :open="sourceOpen"
            @toggle="sourceOpen = ($event.target as HTMLDetailsElement).open"
          >
            <summary>
              {{
                sourceReplacement
                  ? `Substituir base ${sourceReplacement.name}`
                  : "Adicionar uma base"
              }}
            </summary>
            <form
              id="source-registration"
              tabindex="-1"
              :aria-label="sourceReplacement ? 'Cadastrar base substituta' : 'Cadastrar base'"
              @submit.prevent="addSource"
            >
              <fieldset :disabled="busy">
                <label
                  >Nome da base<input
                    v-model="sourceForm.name"
                    data-error-field="sources:name"
                    :aria-invalid="invalidField('name') || undefined"
                    :aria-describedby="invalidField('name') ? 'sources-name-error' : undefined"
                    maxlength="200"
                    required
                /></label>
                <p v-if="invalidField('name')" id="sources-name-error" class="error">
                  Revise este campo.
                </p>
                <label
                  >Para que essa base será usada?<textarea
                    v-model="sourceForm.purpose"
                    data-error-field="sources:purpose"
                    :aria-invalid="invalidField('purpose') || undefined"
                    :aria-describedby="
                      invalidField('purpose') ? 'sources-purpose-error' : undefined
                    "
                    maxlength="5000"
                    required
                  />
                </label>
                <p v-if="invalidField('purpose')" id="sources-purpose-error" class="error">
                  Revise este campo.
                </p>
                <label
                  >Ambiente<select
                    v-model="sourceForm.environment"
                    data-error-field="sources:environment"
                    :aria-invalid="invalidField('environment') || undefined"
                    :aria-describedby="
                      invalidField('environment') ? 'sources-environment-error' : undefined
                    "
                  >
                    <option>desenvolvimento</option>
                    <option>homologação</option>
                    <option>produção</option>
                  </select></label
                >
                <p v-if="invalidField('environment')" id="sources-environment-error" class="error">
                  Revise este campo.
                </p>
                <label
                  >AGENT_ID<input
                    v-model="sourceForm.agentId"
                    data-error-field="sources:agentId"
                    :aria-invalid="invalidField('agentId') || undefined"
                    :aria-describedby="
                      invalidField('agentId') ? 'sources-agentId-error' : undefined
                    "
                    required
                /></label>
                <p v-if="invalidField('agentId')" id="sources-agentId-error" class="error">
                  Revise este campo.
                </p>
                <label
                  >CLIENT_EMAIL<input
                    v-model="sourceForm.email"
                    data-error-field="sources:email"
                    :aria-invalid="invalidField('email') || undefined"
                    :aria-describedby="invalidField('email') ? 'sources-email-error' : undefined"
                    type="email"
                    autocomplete="off"
                    required
                /></label>
                <p v-if="invalidField('email')" id="sources-email-error" class="error">
                  Revise este campo.
                </p>
                <label
                  >CLIENT_PASSWORD<input
                    v-model="sourceForm.password"
                    data-error-field="sources:password"
                    :aria-invalid="invalidField('password') || undefined"
                    :aria-describedby="
                      invalidField('password') ? 'sources-password-error' : undefined
                    "
                    type="password"
                    autocomplete="off"
                    required
                /></label>
                <p v-if="invalidField('password')" id="sources-password-error" class="error">
                  Revise este campo.
                </p>
                <label
                  >CLIENT_TOKEN<input
                    v-model="sourceForm.clientToken"
                    data-error-field="sources:clientToken"
                    :aria-invalid="invalidField('clientToken') || undefined"
                    :aria-describedby="
                      invalidField('clientToken') ? 'sources-clientToken-error' : undefined
                    "
                    type="password"
                    autocomplete="off"
                    required
                /></label>
                <p v-if="invalidField('clientToken')" id="sources-clientToken-error" class="error">
                  Revise este campo.
                </p>
                <label
                  >DIALETO<select
                    v-model="sourceForm.dialect"
                    data-error-field="sources:dialect"
                    :aria-invalid="invalidField('dialect') || undefined"
                    :aria-describedby="
                      invalidField('dialect') ? 'sources-dialect-error' : undefined
                    "
                  >
                    <option value="mssql">SQL Server</option>
                    <option value="postgres">PostgreSQL</option>
                    <option value="sybase">SQL Anywhere</option>
                  </select></label
                >
                <p v-if="invalidField('dialect')" id="sources-dialect-error" class="error">
                  Revise este campo.
                </p>
                <p>
                  O banco será identificado pela autorização do agente. Credenciais ficam cifradas
                  no servidor.
                </p>
                <template v-if="sourceReplacement">
                  <p>
                    O vínculo anterior será preservado e ficará bloqueado. Treinamento, permissões e
                    operações não serão transferidos.
                  </p>
                  <label
                    ><input v-model="replacementConfirmed" type="checkbox" />Confirmo o cadastro
                    independente desta base substituta.</label
                  >
                </template>
                <button :disabled="!!sourceReplacement && !replacementConfirmed">
                  {{ sourceReplacement ? "Verificar e substituir base" : "Conectar base" }}
                </button>
                <button v-if="sourceReplacement" type="button" @click="cancelSourceReplacement">
                  Cancelar substituição
                </button>
              </fieldset>
            </form>
          </details>
        </section>
        <section v-if="sources.length" v-show="area === 'training'">
          <h2>Treinar consultas</h2>
          <p>
            Origem: treinamento desta persona e fonte, com versões compartilhadas quando adotadas. A
            base técnica comum orienta SQL e API; estrutura e significado de negócio exigem revisão.
          </p>
          <p>
            Organize finalidade e fonte, estrutura, relacionamentos, exemplos, parâmetros, regras e
            testes. O SQL principal permanece o modelo desta skill.
          </p>
          <fieldset :disabled="busy">
            <label
              >Editar treinamento<select :value="draftId" @change="editDraft">
                <option value="">Novo treinamento</option>
                <option
                  v-for="d in drafts.filter((item) => item.kind === 'consulta')"
                  :key="d.id"
                  :value="d.id"
                >
                  {{ d.name }} ·
                  {{
                    publications[d.id]
                      ? publications[d.id].revision === d.revision
                        ? "publicado"
                        : "alterações pendentes"
                      : d.activePublicationId
                        ? "publicação suspensa"
                        : "rascunho"
                  }}
                </option>
              </select></label
            >
            <button type="button" class="secondary" :disabled="!draftId" @click="reloadTraining">
              Recarregar treinamento
            </button>
            <form aria-label="Treinar consulta" @submit.prevent="saveTraining">
              <fieldset :disabled="queryCaseDirty">
                <label
                  >Nome<input
                    v-model="name"
                    data-error-field="training:name"
                    :aria-invalid="invalidField('name') || undefined"
                    :aria-describedby="invalidField('name') ? 'training-name-error' : undefined"
                    required /></label
                ><label
                  >Identificador curto<input
                    v-model="slug"
                    data-error-field="training:slug"
                    :aria-invalid="invalidField('slug') || undefined"
                    :aria-describedby="invalidField('slug') ? 'training-slug-error' : undefined"
                    :disabled="!!draftId"
                    pattern="[a-z0-9]+(-[a-z0-9]+)*"
                    placeholder="consulta-pedidos"
                    required
                /></label>
                <p v-if="invalidField('name')" id="training-name-error" class="error">
                  Revise o nome do treinamento. A edição foi preservada.
                </p>
                <p v-if="invalidField('slug')" id="training-slug-error" class="error">
                  Revise o identificador curto do treinamento.
                </p>
                <div
                  v-if="invalidField('training')"
                  data-error-field="training:training"
                  tabindex="-1"
                  role="group"
                  aria-label="Treinamento recusado"
                  aria-describedby="training-content-error"
                >
                  <p id="training-content-error" class="error">
                    O conteúdo do treinamento foi recusado. Revise a base, a estrutura, os exemplos,
                    parâmetros e regras conforme o motivo acima. Nenhum campo foi apagado.
                  </p>
                </div>
                <label
                  >Base<select :value="training.sourceId" required @change="changeTrainingSource">
                    <option value="">Selecione</option>
                    <option v-for="s in sources" :key="s.id" :value="s.id" :disabled="!s.active">
                      {{ s.name }}{{ s.active ? "" : " (indisponível)" }}
                    </option>
                  </select></label
                ><label>Objetivo da consulta<textarea v-model="training.purpose" required /></label>
                <h3>Tabelas</h3>
                <div v-for="(t, i) in training.tables" :key="i" class="row">
                  <label
                    >Nome físico<input v-model="t.name" placeholder="dbo.pedidos" required /></label
                  ><label
                    >Tipo do recurso<select
                      :value="t.resourceType ?? 'table'"
                      @change="
                        t.resourceType = ($event.target as HTMLSelectElement).value as
                          'table' | 'view'
                      "
                    >
                      <option value="table">Tabela</option>
                      <option value="view">View</option>
                    </select></label
                  ><label>Significado<input v-model="t.meaning" required /></label
                  ><label
                    >Colunas que identificam um registro<input
                      :value="t.grain.join(', ')"
                      placeholder="id"
                      required
                      @input="t.grain = split(($event.target as HTMLInputElement).value)" /></label
                  ><button type="button" @click="training.tables.splice(i, 1)">
                    Remover tabela
                  </button>
                </div>
                <button type="button" @click="addTable">Adicionar tabela</button>
                <h3>Colunas</h3>
                <LimitsEditor
                  v-model="training.limits"
                  kind="query"
                  label="Limites desta skill de consulta"
                />
                <fieldset>
                  <legend>Anexos desta consulta</legend>
                  <label class="check"
                    ><input
                      type="checkbox"
                      :checked="!!training.attachments"
                      @change="toggleAttachments"
                    />Permitir anexos JSON após publicação e concessão explícitas</label
                  >
                  <template v-if="training.attachments">
                    <label
                      >Limite do arquivo (MiB)<input
                        type="number"
                        min="0.25"
                        max="8"
                        step="0.25"
                        :value="training.attachments.maxBytes / 1048576"
                        required
                        @input="
                          training.attachments.maxBytes =
                            Number(($event.target as HTMLInputElement).value) * 1048576
                        "
                    /></label>
                    <label
                      >Validade do anexo (minutos)<input
                        type="number"
                        min="1"
                        max="15"
                        step="1"
                        :value="training.attachments.ttlMs / 60000"
                        required
                        @input="
                          training.attachments.ttlMs =
                            Number(($event.target as HTMLInputElement).value) * 60000
                        "
                    /></label>
                    <p>
                      Marque exportação nos campos permitidos. Tokens existentes precisam de nova
                      concessão; esta edição não os amplia.
                    </p>
                  </template>
                </fieldset>
                <BinaryAttachmentEditor
                  v-model="training.binaryAttachments"
                  :columns="training.columns"
                />
                <div v-for="(c, i) in training.columns" :key="i" class="row">
                  <label
                    >Tabela<select v-model="c.table" required>
                      <option value="">Selecione</option>
                      <option
                        v-if="c.table && !training.tables.some((t) => t.name === c.table)"
                        :value="c.table"
                      >
                        {{ c.table }} (referência pendente)
                      </option>
                      <option
                        v-for="table in training.tables"
                        :key="table.name"
                        :value="table.name"
                      >
                        {{ table.name }}
                      </option>
                    </select></label
                  ><label>Coluna<input v-model="c.name" required /></label
                  ><label>Significado<input v-model="c.meaning" required /></label
                  ><label
                    >Classificação<select v-model="c.classification">
                      <option value="livre">Livre</option>
                      <option value="sensivel">Sensível</option>
                      <option value="pessoal">Pessoal</option>
                      <option value="segredo">Segredo</option>
                      <option value="inferido">Ainda não confirmado</option>
                    </select></label
                  ><button type="button" @click="training.columns.splice(i, 1)">
                    Remover coluna
                  </button>
                  <FieldUseEditor :field="c" @change="training.columns[i] = $event" />
                </div>
                <button type="button" @click="addColumn">Adicionar coluna</button>
                <p>
                  Campos pessoais e sensíveis exigem finalidades e justificativa explícitas no
                  treinamento publicado e concessões no token. Segredos e campos não confirmados
                  permanecem bloqueados.
                </p>
                <h3>Relacionamentos</h3>
                <div v-for="(r, i) in training.relationships" :key="i" class="relationship">
                  <label
                    >Identificador do relacionamento<input
                      v-model="r.id"
                      pattern="[a-z][a-z0-9_-]*"
                      maxlength="100"
                  /></label>
                  <div class="row">
                    <label
                      >Tabela de origem<select v-model="r.from" required>
                        <option value="">Selecione</option>
                        <option
                          v-if="r.from && !training.tables.some((t) => t.name === r.from)"
                          :value="r.from"
                        >
                          {{ r.from }} (referência pendente)
                        </option>
                        <option
                          v-for="table in training.tables"
                          :key="table.name"
                          :value="table.name"
                        >
                          {{ table.name }}
                        </option>
                      </select></label
                    ><label
                      >Tabela de destino<select v-model="r.to" required>
                        <option value="">Selecione</option>
                        <option
                          v-if="r.to && !training.tables.some((t) => t.name === r.to)"
                          :value="r.to"
                        >
                          {{ r.to }} (referência pendente)
                        </option>
                        <option
                          v-for="table in training.tables"
                          :key="table.name"
                          :value="table.name"
                        >
                          {{ table.name }}
                        </option>
                      </select></label
                    ><label
                      >Tipo<select v-model="r.join">
                        <option value="inner">INNER JOIN</option>
                        <option value="left">LEFT JOIN</option>
                      </select></label
                    ><label
                      >Cardinalidade<select v-model="r.cardinality">
                        <option>1:1</option>
                        <option>N:1</option>
                        <option>1:N</option>
                        <option>N:N</option>
                      </select></label
                    >
                  </div>
                  <div v-for="(k, j) in r.keys" :key="j" class="row">
                    <label
                      >Coluna de origem<select v-model="k.from" required>
                        <option value="">Selecione</option>
                        <option
                          v-if="
                            k.from &&
                            !training.columns.some((c) => c.table === r.from && c.name === k.from)
                          "
                          :value="k.from"
                        >
                          {{ k.from }} (referência pendente)
                        </option>
                        <option
                          v-for="column in training.columns.filter((c) => c.table === r.from)"
                          :key="column.name"
                        >
                          {{ column.name }}
                        </option>
                      </select></label
                    ><label
                      >Coluna de destino<select v-model="k.to" required>
                        <option value="">Selecione</option>
                        <option
                          v-if="
                            k.to &&
                            !training.columns.some((c) => c.table === r.to && c.name === k.to)
                          "
                          :value="k.to"
                        >
                          {{ k.to }} (referência pendente)
                        </option>
                        <option
                          v-for="column in training.columns.filter((c) => c.table === r.to)"
                          :key="column.name"
                        >
                          {{ column.name }}
                        </option>
                      </select></label
                    ><button type="button" @click="r.keys.splice(j, 1)">Remover par</button>
                  </div>
                  <button type="button" @click="r.keys.push({ from: '', to: '' })">
                    Adicionar par de colunas</button
                  ><label
                    >O que esse relacionamento significa?<input
                      v-model="r.meaning"
                      required /></label
                  ><button type="button" @click="training.relationships.splice(i, 1)">
                    Remover relacionamento
                  </button>
                  <RelationshipPathFields
                    v-model="training.relationships[i]"
                    :relations="training.relationships"
                    :tables="training.tables"
                  />
                </div>
                <button type="button" @click="addRelationship">Adicionar relacionamento</button>
                <RelationshipDiagram
                  :tables="training.tables.map((t) => ({ id: t.name, name: t.name }))"
                  :relationships="training.relationships"
                />
                <h3>Parâmetros</h3>
                <fieldset v-for="(p, i) in training.parameters" :key="i" class="row">
                  <legend>Parâmetro {{ i + 1 }}</legend>
                  <label>Nome do parâmetro<input v-model="p.name" required /></label
                  ><label
                    >Tipo do parâmetro<select v-model="p.type">
                      <option>string</option>
                      <option>number</option>
                      <option>integer</option>
                      <option>decimal</option>
                      <option>boolean</option>
                      <option>date</option>
                      <option>datetime</option>
                    </select></label
                  ><label>Significado do parâmetro<input v-model="p.meaning" required /></label
                  ><label class="check"
                    ><input v-model="p.required" type="checkbox" />Obrigatório</label
                  ><button type="button" @click="training.parameters.splice(i, 1)">
                    Remover parâmetro
                  </button>
                </fieldset>
                <button type="button" @click="addParameter">Adicionar parâmetro</button>
                <label
                  >Regras de negócio (uma por linha)<textarea
                    :value="training.rules.join('\n')"
                    @input="
                      training.rules = ($event.target as HTMLTextAreaElement).value
                        .split('\n')
                        .filter((s) => s.trim())
                    "
                  /></label
                ><label
                  >Exemplo de SQL<textarea
                    v-model="training.sqlModel"
                    class="sql"
                    spellcheck="false"
                    required
                  />
                </label>
                <h3>Outros exemplos de consulta</h3>
                <p v-for="pair in duplicateExamples" :key="pair.join(':')" class="notice">
                  Possível duplicação entre {{ pair[0] }} e {{ pair[1] }}. Revise a finalidade antes
                  de consolidar; nenhuma alteração foi aplicada.
                </p>
                <p>Os exemplos usam a mesma base, estrutura e parâmetros deste treinamento.</p>
                <div
                  v-for="(example, index) in training.examples ?? []"
                  :key="index"
                  class="relationship"
                >
                  <label
                    >Identificação do exemplo<input
                      v-model="example.id"
                      pattern="[a-z][a-z0-9_-]*"
                      maxlength="100"
                      required
                  /></label>
                  <label>Finalidade do exemplo<input v-model="example.purpose" required /></label>
                  <label
                    >Estado editorial do exemplo<select
                      :value="example.state ?? 'approved'"
                      @change="changeExampleState(example, $event)"
                    >
                      <option value="candidate">Candidato — exige revisão</option>
                      <option value="approved">Revisado para publicação</option>
                      <option value="inactive">Inativo</option>
                      <option value="replaced">Substituído</option>
                    </select></label
                  >
                  <label
                    >Explicação do exemplo<textarea v-model="example.explanation" required />
                  </label>
                  <label
                    >SQL do exemplo<textarea
                      v-model="example.sql"
                      class="sql"
                      spellcheck="false"
                      required
                    />
                  </label>
                  <button type="button" @click="training.examples?.splice(index, 1)">
                    Remover exemplo
                  </button>
                </div>
                <button type="button" @click="addExample">Adicionar exemplo SQL</button>
                <p v-if="dirty">Há alterações não salvas.</p>
                <button>Salvar rascunho</button>
              </fieldset>
            </form>
            <SourceKnowledgeWorkspace
              v-if="area === 'training' && training.sourceId"
              :key="`training:${personaId}:${trainingKnowledgeKey}`"
              :sources="sources"
              :persona-base="path()"
              :api="api"
              :disabled="busy || queryCaseDirty"
              :confirm-discard="confirmDiscard"
              :training="training"
              @training="training = $event"
              @dirty="trainingKnowledgeDirty = $event"
              @lock="busy = $event"
            />
            <QueryTestsPanel
              v-if="draftId"
              :key="`${personaId}:${draftId}:${queryTestsKey}`"
              :root="`${path()}/skills/${draftId}`"
              :revision="revision"
              :training="training"
              :confirm-discard="confirmDiscard"
              :api="api"
              :disabled="busy || dirty || trainingKnowledgeDirty"
              @dirty="queryCaseDirty = $event"
              @lock="busy = $event"
              @saved="
                revision = $event;
                preview = undefined;
                confirmed = false;
                drafts = drafts.map((d) => (d.id === draftId ? { ...d, revision: $event } : d));
              "
            />
            <p v-if="trainingKnowledgeDirty" class="notice">
              Conclua a inspeção e aplique a seleção compartilhada, ou descarte as alterações antes
              de revisar a publicação.
            </p>
            <label
              >Prazo de revisão da publicação<input v-model="reviewDate" type="datetime-local"
            /></label>
            <button
              :disabled="!draftId || dirty || queryCaseDirty || trainingKnowledgeDirty"
              @click="previewTraining"
            >
              Revisar publicação
            </button>
            <div v-if="preview">
              <h3>Revisão {{ preview.revision }}</h3>
              <p>Próxima revisão: {{ new Date(preview.reviewDueAt).toLocaleString() }}</p>
              <p>Validade: {{ new Date(preview.expiresAt).toLocaleString() }}</p>
              <p v-for="warning in preview.warnings" :key="warning" class="notice">
                {{
                  warning === "SEM_CASOS_DE_TESTE"
                    ? "Esta consulta ainda não possui casos de teste cadastrados."
                    : warning
                }}
              </p>
              <PublicationReview :preview="preview" />
              <details>
                <summary>Ver pacote e alterações de permissões</summary>
                <pre>{{ JSON.stringify(preview, null, 2) }}</pre>
              </details>
              <label class="check"
                ><input v-model="confirmed" type="checkbox" />Revisei o SQL, a estrutura e as regras
                deste pacote.</label
              ><button :disabled="!confirmed || dirty" @click="publishTraining">
                Confirmar publicação
              </button>
            </div>
          </fieldset>
        </section>
        <FederationSkillEditor
          v-if="area === 'training' && sources.length"
          :key="`federation-skill:${persona.id}:${federationSkillKey}`"
          :base="path()"
          :sources="sources"
          :api="api"
          :disabled="busy"
          :confirm-discard="confirmDiscard"
          @dirty="federationSkillDirty = $event"
          @lock="busy = $event"
          @changed="load"
        />
        <ExternalSkillEditor
          v-if="area === 'training'"
          :key="`external-skill:${persona.id}:${externalSkillKey}`"
          :base="path()"
          :api="api"
          :disabled="busy"
          :confirm-discard="confirmDiscard"
          @dirty="externalSkillDirty = $event"
          @lock="busy = $event"
          @changed="load"
        />
        <OperationSkillEditor
          v-if="area === 'training' && sources.length"
          :key="`operation-skill:${persona.id}:${operationSkillKey}`"
          :base="path()"
          :sources="sources"
          :api="api"
          :disabled="busy"
          :confirm-discard="confirmDiscard"
          @dirty="operationSkillDirty = $event"
          @lock="busy = $event"
          @changed="load"
        />
        <section v-show="area === 'tokens'">
          <h2>Tokens e conexões</h2>
          <OAuthConnectionInfo v-if="area === 'tokens'" :key="persona.id" :api="api" />
          <OwnerDelegationPanel
            v-if="area === 'tokens'"
            :key="`delegation:${persona.id}:${delegationKey}`"
            :persona-id="persona.id"
            :api="api"
            @dirty="delegationDirty = $event"
            @lock="busy = $event"
          />
          <ConnectionPanel
            v-if="area === 'tokens'"
            :key="persona.id"
            :persona-id="persona.id"
            :bearer="bearer"
            :call="mcp"
            @lock="busy = $event"
          />
          <TokenManager
            v-if="area === 'tokens'"
            :key="`${persona.id}:${tokenManagerKey}`"
            :api="api"
            :confirm-discard="confirmDiscard"
            :base="path()"
            :refresh="tokenRefresh"
            :disabled="busy"
            :publications="tokenPublications"
            :sources="sources"
            @dirty="tokenManagerDirty = $event"
            @lock="busy = $event"
            @bearer="bearer = $event"
          />
          <OAuthConnectionsPanel
            v-if="area === 'tokens'"
            :key="`${persona.id}:${oauthConnectionsKey}`"
            :api="api"
            :base="path()"
            :disabled="busy"
            :refresh="tokenRefresh"
            @dirty="oauthConnectionsDirty = $event"
            @lock="busy = $event"
          />
          <h3>Emitir token da persona</h3>
          <section
            v-if="issuanceRecovery"
            aria-label="Conferir emissão sem confirmação"
            class="notice"
          >
            <p>
              A emissão pode ter sido concluída. Não repita o envio. Confira os tokens cadastrados;
              o segredo perdido não pode ser recuperado.
            </p>
            <button :disabled="busy" class="secondary" @click="inspectUncertainIssuance">
              Conferir tokens antes de nova emissão
            </button>
            <ul v-if="issuanceRecovery.checked">
              <li v-for="item in issuanceRecovery.tokens" :key="item.id">
                {{ item.name }} · {{ item.id }} · {{ item.revokedAt ? "Revogado" : "Não revogado" }}
              </li>
            </ul>
            <p v-if="issuanceRecovery.checked">
              A listagem não identifica automaticamente qual cadastro corresponde à tentativa.
              Revise o consumidor e as concessões em Gerenciar tokens.
            </p>
            <button
              :disabled="busy || !issuanceRecovery.checked"
              class="secondary"
              @click="startNewIssuance"
            >
              Iniciar nova emissão
            </button>
          </section>
          <form aria-label="Emitir token" @submit.prevent="issueToken">
            <fieldset :disabled="busy || !!issuanceRecovery">
              <label>Nome do consumidor<input v-model="tokenName" required /></label>
              <p>
                Selecione consultas, cruzamentos, operações SQL ou capacidades externas. Selecionar
                uma capacidade externa concede também sua operação específica. Novos lançamentos SQL
                e ações externas exigem aprovação adicional; a política da skill continua
                obrigatória. Cada cruzamento exige selecionar também suas consultas dependentes;
                nenhuma concessão será adicionada automaticamente.
              </p>
              <div v-for="(p, id) in tokenPublications" :key="id">
                <label class="check"
                  ><input
                    :checked="selectedSkills.includes(String(id))"
                    :disabled="!!p.suspendedAt"
                    type="checkbox"
                    @change="
                      selectTokenSkill(String(id), ($event.target as HTMLInputElement).checked)
                    "
                  />{{
                    `${p.package.name} · revisão ${p.revision}${p.package.format === "persona-query-v2" ? "" : ` · ${publicationEffectsLabel(p)}`}`
                  }}</label
                >
                <ul v-if="p.package.requiredCapabilities.some((c) => c.startsWith('field-use:'))">
                  <li
                    v-for="capability in p.package.requiredCapabilities.filter((c) =>
                      c.startsWith('field-use:'),
                    )"
                    :key="capability"
                  >
                    {{ fieldCapabilityLabel(capability) }}
                  </li>
                </ul>
              </div>
              <details>
                <summary>Limites do novo token</summary>
                <LimitsEditor
                  v-model="tokenLimits.queryLimits"
                  kind="query"
                  label="Consultas do novo token"
                />
                <LimitsEditor
                  v-model="tokenLimits.operationLimits"
                  kind="operation"
                  label="Lançamentos do novo token"
                />
                <LimitsEditor
                  v-model="tokenLimits.federationLimits"
                  kind="federation"
                  label="Cruzamentos do novo token"
                />
                <div v-for="id in selectedSkills" :key="id">
                  <p>{{ tokenPublications[id]?.package.name }}</p>
                  <LimitsEditor
                    v-if="tokenSkillLimits[id]"
                    v-model="tokenSkillLimits[id]!.queryLimits"
                    kind="query"
                    label="Concessão desta consulta"
                  />
                  <LimitsEditor
                    v-if="tokenSkillLimits[id]"
                    v-model="tokenSkillLimits[id]!.federationLimits"
                    kind="federation"
                    label="Concessão deste cruzamento"
                  />
                </div>
              </details>
              <p>
                Selecione explicitamente as consultas. Novas fontes e treinamentos não ampliam este
                token.
              </p>
              <p>
                Selecionar uma publicação concede o conjunto de campos e finalidades exibido. Uma
                concessão incompleta bloqueia a publicação inteira.
              </p>
              <label class="check"
                ><input v-model="tokenNoExpiry" type="checkbox" />Sem expiração (escolha
                explícita)</label
              >
              <label v-if="!tokenNoExpiry"
                >Validade em dias<input
                  v-model.number="tokenDays"
                  type="number"
                  min="1"
                  max="3650"
                  required
              /></label>
              <fieldset>
                <legend>Permissões administrativas</legend>
                <label v-for="option in administrativeOptions" :key="option.id"
                  ><input v-model="tokenAdministrative" type="checkbox" :value="option.id" />{{
                    option.label
                  }}</label
                >
                <p>
                  Administração exige também delegação vigente no hub. Não substitui autorização
                  para consultar ou aprovação humana.
                </p>
                <label v-for="source in sources.filter((s) => s.active)" :key="source.id"
                  ><input
                    v-model="tokenAdministrativeSources"
                    type="checkbox"
                    :value="source.id"
                  />Base para administração: {{ source.name }}</label
                >
                <label
                  ><input v-model="tokenCanDelegate" type="checkbox" />Permitir delegar as
                  concessões selecionadas a outros tokens</label
                >
                <ManagedIntegrationsSelector
                  v-if="tokenAdministrative.includes('gerenciar_integracoes')"
                  v-model="tokenManagedIntegrations"
                  :api="api"
                  :base="path()"
                  :disabled="busy"
                />
              </fieldset>
              <button :disabled="!selectedSkills.length && !tokenAdministrative.length">
                Emitir token restrito
              </button>
            </fieldset>
          </form>
          <label
            >Token para conectar o cliente ou testar<input
              v-model="bearer"
              :type="showBearer ? 'text' : 'password'"
              autocomplete="off"
              :disabled="busy" /></label
          ><button :disabled="busy || !bearer" @click="copyBearer">Copiar token</button>
          <button class="secondary" :disabled="busy || !bearer" @click="revealBearer">
            {{ showBearer ? "Ocultar token" : "Revelar token" }}
          </button>
          <button class="secondary" :disabled="busy || !bearer" @click="bearer = ''">
            Ocultar e descartar token
          </button>
          <p>Copie o token antes de sair; ele não é salvo no navegador.</p>
        </section>
        <section v-show="area === 'queries'">
          <h2>Consultar dados publicados</h2>
          <label
            >Token para consultar<input
              v-model="bearer"
              type="password"
              autocomplete="off"
              :disabled="busy"
          /></label>
          <button class="secondary" :disabled="busy || !bearer" @click="inspectToken">
            Ver consultas permitidas por este token
          </button>
          <p v-if="grantedQueries && !Object.keys(queryPublications).length">
            Nenhuma consulta desta persona foi concedida ao token.
          </p>
          <fieldset :disabled="busy">
            <label
              >Consulta<select v-model="querySkill">
                <option value="">Selecione</option>
                <option v-for="(p, id) in queryPublications" :key="id" :value="String(id)">
                  {{ `${p.package.name} · revisão ${p.revision}` }}
                </option>
              </select></label
            ><template v-if="active"
              ><p>Fonte: {{ sources.find((s) => s.id === active?.package.sourceId)?.name }}</p>
              <div v-for="p in active.package.training.parameters" :key="p.name">
                <label
                  >{{ p.meaning }} ({{ p.name }}) · {{ p.required ? "Obrigatório" : "Opcional"
                  }}<select
                    v-if="p.type === 'boolean'"
                    v-model="queryValues[p.name]"
                    :disabled="queryModes[p.name] && queryModes[p.name] !== 'value'"
                  >
                    <option value="">Escolha</option>
                    <option value="true">Sim</option>
                    <option value="false">Não</option></select
                  ><input
                    v-else
                    v-model="queryValues[p.name]"
                    :disabled="queryModes[p.name] && queryModes[p.name] !== 'value'"
                /></label>
                <label :for="`mode-${p.name}`">Como enviar {{ p.name }}</label
                ><select
                  :id="`mode-${p.name}`"
                  :value="queryModes[p.name] ?? 'value'"
                  @change="
                    queryModes[p.name] = ($event.target as HTMLSelectElement).value as ParameterMode
                  "
                >
                  <option value="value">Valor informado</option>
                  <option v-if="p.type === 'string'" value="empty">Texto vazio</option>
                  <option v-if="!p.required" value="null">Nulo explícito</option>
                  <option v-if="!p.required" value="omit">Omitir parâmetro</option>
                </select>
              </div>
              <label
                >SQL adaptado (opcional; vazio usa o exemplo publicado)<textarea
                  v-model="querySql"
                  class="sql"
                  spellcheck="false"
                /></label
              ><label
                >Linhas por página<select v-model.number="queryPageSize">
                  <option :value="25">25</option>
                  <option :value="50">50</option>
                  <option :value="100">100</option>
                </select></label
              >
              <button :disabled="!bearer" @click="query(true)">Validar SQL</button
              ><button :disabled="!bearer" @click="query()">Consultar</button>
              <button
                v-if="active.package.training.attachments"
                :disabled="!bearer || busy"
                @click="createAttachment('json')"
              >
                Criar anexo JSON
              </button>
              <p v-if="active.package.training.attachments">
                Criar anexo executa uma nova consulta, com os filtros e a página escolhidos. Exige
                exportação concedida para todos os campos retornados.
              </p>
              <button
                v-if="active.package.training.binaryAttachments"
                :disabled="!bearer || busy"
                @click="createAttachment('binary')"
              >
                Criar anexo binário
              </button>
              <p v-if="active.package.training.binaryAttachments">
                Selecione um único registro pelos filtros. Binários não usam paginação e não são
                mostrados na tabela de consulta.
              </p></template
            >
          </fieldset>
          <section v-if="attachment" aria-label="Anexo da consulta">
            <h3>{{ attachment.format === "binary" ? "Anexo binário" : "Anexo JSON" }}</h3>
            <p>{{ attachment.mimeType }}</p>
            <p>
              {{ attachment.rows }} registros · {{ attachment.bytes }} bytes · leitura em
              {{ new Date(attachment.readAt).toLocaleString() }}
            </p>
            <p :class="attachment.complete ? 'success' : 'notice'">
              {{
                attachment.complete
                  ? "Completo para esta consulta."
                  : "Parcial: o arquivo não representa o total."
              }}
            </p>
            <p>
              Disponível até {{ new Date(attachment.expiresAt).toLocaleString() }}. O download
              revalida o acesso.
            </p>
            <button :disabled="busy || !bearer" @click="downloadAttachment">
              {{ attachment.format === "binary" ? "Baixar anexo binário" : "Baixar anexo JSON" }}
            </button>
          </section>
          <div v-if="result">
            <p :class="result.completeness.complete ? 'success' : 'notice'">
              {{
                result.completeness.complete
                  ? "Resultado completo para esta consulta."
                  : "Resultado parcial: não utilize estas linhas como total."
              }}
            </p>
            <p>
              Fonte: {{ sources.find((s) => s.id === result?.provenance.sourceId)?.name }} ·
              Leitura: {{ new Date(result.provenance.readAt).toLocaleString() }}
            </p>
            <p v-if="result.reuse && result.reuse.kind !== 'fresh'" class="notice">
              Leitura reutilizada, com permissões conferidas novamente. O horário acima é o da
              consulta original; os dados podem ter mudado desde então.
            </p>
            <p v-if="!result.rows.length">
              Nenhum registro retornado para os filtros desta consulta.
            </p>
            <p>
              Publicação: {{ active?.package.name }} · revisão {{ active?.revision }} · Dialeto:
              {{ result.provenance.dialect }}
            </p>
            <details>
              <summary>Filtros utilizados e identificação da publicação</summary>
              <pre>{{
                JSON.stringify(
                  { filtros: submittedFilters, publicacoes: result.provenance.publications },
                  null,
                  2,
                )
              }}</pre>
            </details>
            <p v-if="result.limits">
              Limites desta execução: {{ result.limits.maxRows }} linhas,
              {{ result.limits.pageSize }} por página, {{ result.limits.maxBytes }} bytes e
              {{ result.limits.timeoutMs }} ms.
            </p>
            <div v-if="result.pagination" class="pagination">
              <button
                class="secondary"
                :disabled="busy || queryPage <= 1"
                @click="query(false, queryPage - 1)"
              >
                Página anterior
              </button>
              <span
                >Página {{ result.pagination.page }} · {{ result.rows.length }} registros nesta
                página</span
              >
              <button
                class="secondary"
                :disabled="busy || !result.pagination.hasNextPage"
                @click="query(false, queryPage + 1)"
              >
                Próxima página
              </button>
            </div>
            <div class="scroll">
              <table>
                <thead>
                  <tr>
                    <th v-for="column in result.columns" :key="column" scope="col">{{ column }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(row, i) in result.rows" :key="i">
                    <td v-for="column in result.columns" :key="column">{{ cell(row[column]) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>
        <FederationPanel
          v-if="area === 'queries'"
          :key="`${personaId}:${federationKey}`"
          :persona-id="personaId"
          :bearer="bearer"
          :sources="sources"
          :disabled="busy"
          :mcp="mcp"
          :confirm-discard="confirmDiscard"
          @lock="busy = $event"
          @dirty="federationDirty = $event"
        />
        <section v-if="area === 'knowledge'">
          <KnowledgeExplorer
            :key="`explore:${personaId}:${sourceKnowledgeKey}`"
            :persona-id="personaId"
            :bearer="bearer"
            :call="mcp"
            :disabled="busy"
            :confirm-discard="confirmDiscard"
            @lock="busy = $event"
            @dirty="explorerDirty = $event"
          />
          <KnowledgeFeedbackPanel
            :key="`feedback:${personaId}:${sourceKnowledgeKey}`"
            :persona-base="path()"
            :drafts="
              Object.entries(tokenPublications).map(([id, p]) => ({
                id,
                name: p.package.name,
                activePublicationId: p.id,
              }))
            "
            :api="api"
            :disabled="busy"
            :confirm-discard="confirmDiscard"
            @dirty="knowledgeMaintenanceDirty = $event"
            @lock="busy = $event"
          />
          <SourceKnowledgeWorkspace
            :key="`knowledge:${personaId}:${sourceKnowledgeKey}`"
            :sources="sources"
            :persona-base="path()"
            :api="api"
            :disabled="busy"
            :confirm-discard="confirmDiscard"
            @dirty="sourceKnowledgeDirty = $event"
            @lock="busy = $event"
          />
          <RouterLink :to="{ name: 'catalog' }">Abrir catálogo compartilhado</RouterLink>
        </section>
        <section v-if="area === 'training' && !sources.length">
          <h2>Treinamentos</h2>
          <p>Cadastre uma base antes de treinar uma consulta.</p>
          <RouterLink :to="{ name: 'sources' }">Cadastrar base</RouterLink>
        </section>
        <OperationsPanel
          v-if="area === 'operations'"
          :key="`${personaId}:${operationActionsKey}`"
          :api="api"
          :base="path()"
          :sources="sources"
          :disabled="busy"
          :persona-id="personaId"
          :bearer="bearer"
          :call="mcp"
          :confirm-discard="confirmDiscard"
          @bearer="bearer = $event"
          @dirty="operationActionsDirty = $event"
          @lock="busy = $event"
        />
        <NotificationsPanel
          v-if="area === 'operations'"
          :key="`${personaId}-${notificationsKey}`"
          :api="api"
          :base="path()"
          :disabled="busy"
          @dirty="notificationsDirty = $event"
          @lock="busy = $event"
        />
        <HistoryPanel v-if="area === 'history'" :key="personaId" :api="api" :base="path()" />
        <section v-if="area === 'integrations'">
          <IntegrationManagementPanel
            :key="`${personaId}:${integrationManagementKey}`"
            :api="api"
            :base="path()"
            :disabled="busy"
            :confirm-discard="confirmDiscard"
            @dirty="integrationManagementDirty = $event"
            @lock="busy = $event"
          />
          <ExternalTestsPanel
            :key="`${personaId}:${externalTestsKey}`"
            :api="api"
            :base="path()"
            :disabled="busy"
            :confirm-discard="confirmDiscard"
            @dirty="externalTestsDirty = $event"
            @lock="busy = $event"
          />
          <ExternalActionsPanel
            :key="`${personaId}:${externalActionsKey}`"
            :api="api"
            :base="path()"
            :disabled="busy"
            :persona-id="personaId"
            :bearer="bearer"
            :call="mcp"
            :confirm-discard="confirmDiscard"
            @bearer="bearer = $event"
            @dirty="externalActionsDirty = $event"
            @lock="busy = $event"
          />
          <p class="notice">
            Cadastro direto pelo responsável, suspensão e rotação ficam na gestão acima. Contratos,
            casos e publicação ficam em Treinamentos, incluindo descoberta MCP e importação OpenAPI
            como rascunho. Homologação de provedores reais continua pendente; o deploy permanece
            bloqueado.
          </p>
        </section>
      </template>
    </template>
  </main>
</template>
