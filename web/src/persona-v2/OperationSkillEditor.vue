<script setup lang="ts">
import ListSearch from "./ListSearch.vue";
import { matchesSearch } from "./list-search";
import { computed, ref, watch, onBeforeUnmount } from "vue";
import type {
  CatalogTestReport,
  SkillDraft,
  TrainingCase,
  PublicationPreviewResult,
} from "../../../src/domain/persona-v2/catalog";
import { emptyOperation, type OperationTraining } from "./operation-editor";
import type { Source } from "./model";
import { publicationDeadline } from "./publication-deadline";
import { useEditorErrors } from "./useEditorErrors";
import OperationStructureFields from "./OperationStructureFields.vue";
import OperationStepsFields from "./OperationStepsFields.vue";
import OperationCasesPanel from "./OperationCasesPanel.vue";
import OperationRelationshipsEditor from "./OperationRelationshipsEditor.vue";
import SourceKnowledgeWorkspace from "./SourceKnowledgeWorkspace.vue";
import PublicationReview from "./PublicationReview.vue";
import { operationTrainingSchema } from "../../../src/domain/persona-v2/operation-training";
interface TestDetails {
  revision: number;
  packageHash: string | null;
  casesHash: string;
  cases: TrainingCase[];
  requiredApproved: boolean;
  reports: (CatalogTestReport & { current: boolean })[];
  nextCursor: string | null;
}
const props = defineProps<{
  api: <T>(url: string, body?: unknown) => Promise<T>;
  base: string;
  sources: Source[];
  disabled: boolean;
  confirmDiscard: () => Promise<boolean>;
}>();
const emit = defineEmits<{ dirty: [boolean]; lock: [boolean]; changed: [] }>();
const search = ref("");
const matchingDrafts = computed(() =>
  drafts.value.filter((d) => matchesSearch(search.value, d.name)),
);
const drafts = ref<SkillDraft[]>([]),
  selected = ref(""),
  revision = ref(0),
  name = ref(""),
  slug = ref("");
const training = ref(emptyOperation()),
  saved = ref(""),
  busy = ref(false),
  message = ref("");
const tests = ref<TestDetails>(),
  caseDirty = ref(false),
  caseKey = ref(0),
  reviewDate = ref(""),
  confirmed = ref(false);
const preview = ref<PublicationPreviewResult>(),
  active = ref<{ id: string; revision: number; package: { name: string }; hash: string } | null>(
    null,
  );
const advanced = ref(""),
  advancedOpen = ref(false);
const knowledgeDirty = ref(false),
  knowledgeKey = ref(0),
  knowledgeBusy = ref(false);
const relationships = computed({
  get: () => training.value.relationships ?? [],
  set: (value) => {
    training.value.relationships = value;
  },
});
const { error, errorSummary, root: editorRoot, errorId, capture, invalid } = useEditorErrors();
let live = true;
const fingerprint = computed(() =>
  JSON.stringify({ name: name.value, slug: slug.value, training: training.value }),
);
saved.value = fingerprint.value;
const draftDirty = computed(() => fingerprint.value !== saved.value);
const dirty = computed(
  () =>
    draftDirty.value ||
    caseDirty.value ||
    knowledgeDirty.value ||
    !!reviewDate.value ||
    (advancedOpen.value && advanced.value !== JSON.stringify(training.value, null, 2)),
);
watch(dirty, (value) => emit("dirty", value), { immediate: true });
watch([fingerprint, reviewDate], () => {
  preview.value = undefined;
  confirmed.value = false;
});
onBeforeUnmount(() => {
  live = false;
  training.value = emptyOperation();
  tests.value = undefined;
  preview.value = undefined;
  emit("dirty", false);
  emit("lock", false);
});
const root = computed(() => `${props.base}/skills`);
async function run(fn: () => Promise<void>) {
  if (!live || busy.value || knowledgeBusy.value || props.disabled) return;
  busy.value = true;
  emit("lock", true);
  error.value = "";
  message.value = "";
  try {
    await fn();
  } catch (cause) {
    if (live) capture(cause);
  } finally {
    busy.value = false;
    if (live) emit("lock", false);
  }
}
async function loadList() {
  if (!live) return;
  const result = await props.api<{ skills: SkillDraft[] }>(root.value);
  if (live) drafts.value = result.skills.filter((d) => d.kind === "operacao_sql");
}
async function loadTests() {
  if (!live) return;
  const result = await props.api<TestDetails>(`${root.value}/${selected.value}/testes-operacao`);
  if (live) {
    tests.value = result;
    revision.value = result.revision;
  }
}
async function select(id: string) {
  if (dirty.value && !(await props.confirmDiscard())) return;
  await run(() => loadDraft(id));
}
function selectChanged(event: Event) {
  const input = event.target as HTMLSelectElement;
  const id = input.value;
  input.value = selected.value;
  void select(id);
}
async function loadDraft(id: string) {
  if (!live) return;
  const draft = drafts.value.find((d) => d.id === id);
  selected.value = id;
  revision.value = draft?.revision ?? 0;
  name.value = draft?.name ?? "";
  slug.value = draft?.slug ?? "";
  training.value = draft
    ? (JSON.parse(JSON.stringify(draft.training)) as OperationTraining)
    : emptyOperation();
  saved.value = fingerprint.value;
  tests.value = undefined;
  active.value = null;
  caseDirty.value = false;
  caseKey.value++;
  reviewDate.value = "";
  confirmed.value = false;
  preview.value = undefined;
  advancedOpen.value = false;
  knowledgeDirty.value = false;
  knowledgeKey.value++;
  if (id) {
    await loadTests();
    if (!live) return;
    const result = await props.api<{ publication: typeof active.value }>(
      `${root.value}/${id}/publicacao`,
    );
    if (live) active.value = result.publication;
  }
}
async function sourceChange(event: Event) {
  const input = event.target as HTMLSelectElement,
    next = input.value;
  input.value = training.value.sourceId;
  if (next === training.value.sourceId) return;
  if ((knowledgeDirty.value || training.value.sharedKnowledge) && !(await props.confirmDiscard()))
    return;
  if (!live || busy.value || knowledgeBusy.value || props.disabled) return;
  const source = props.sources.find((s) => s.id === next);
  training.value.sourceId = next;
  if (source && source.dialect !== "firebird") training.value.dialect = source.dialect;
  delete training.value.sharedKnowledge;
  knowledgeDirty.value = false;
  knowledgeKey.value++;
}
function knowledgeLock(value: boolean) {
  if (!live) return;
  knowledgeBusy.value = value;
  emit("lock", value);
}
function adoptKnowledge(value: OperationTraining) {
  training.value = value;
  preview.value = undefined;
  confirmed.value = false;
}
async function save() {
  if (caseDirty.value || knowledgeDirty.value || advancedOpen.value) {
    error.value =
      "Aplique ou descarte a seleção de conhecimento, feche a edição do caso e aplique ou feche o JSON antes de salvar o contrato.";
    return;
  }
  await run(async () => {
    const result = selected.value
      ? await props.api<{ skill: SkillDraft }>(`${root.value}/${selected.value}/rascunho`, {
          name: name.value,
          training: training.value,
          expectedRevision: revision.value,
        })
      : await props.api<{ skill: SkillDraft }>(root.value, {
          name: name.value,
          slug: slug.value,
          kind: "operacao_sql",
          training: training.value,
        });
    if (!live) return;
    selected.value = result.skill.id;
    revision.value = result.skill.revision;
    saved.value = fingerprint.value;
    await loadList();
    await loadTests();
    if (!live) return;
    emit("changed");
    message.value = "Rascunho salvo. A publicação ativa e as permissões não foram alteradas.";
  });
}
async function saveCase(input: {
  id?: string;
  remove: boolean;
  required: boolean;
  content: unknown;
}) {
  await run(async () => {
    await props.api(`${root.value}/${selected.value}/casos-operacao`, {
      ...input,
      expectedRevision: revision.value,
    });
    if (!live) return;
    caseDirty.value = false;
    caseKey.value++;
    preview.value = undefined;
    confirmed.value = false;
    await loadList();
    await loadTests();
    if (!live) return;
    message.value = "Caso salvo. É necessária uma rodada técnica atual pelo runner isolado.";
  });
}
async function refresh() {
  if (dirty.value && !(await props.confirmDiscard())) return;
  await run(async () => {
    await loadList();
    await loadDraft(selected.value);
  });
}
async function review() {
  if (draftDirty.value || caseDirty.value || knowledgeDirty.value || advancedOpen.value) return;
  await run(async () => {
    const result = await props.api<PublicationPreviewResult>(
      `${root.value}/${selected.value}/preview`,
      { reviewDueAt: publicationDeadline(reviewDate.value) },
    );
    if (live) {
      preview.value = result;
      confirmed.value = false;
    }
  });
}
async function publish() {
  if (
    !preview.value ||
    !confirmed.value ||
    draftDirty.value ||
    caseDirty.value ||
    knowledgeDirty.value
  )
    return;
  const hash = preview.value.confirmationHash;
  await run(async () => {
    const result = await props.api<{ publication: NonNullable<typeof active.value> }>(
      `${root.value}/${selected.value}/publicar`,
      { confirmationHash: hash },
    );
    if (!live) return;
    active.value = result.publication;
    reviewDate.value = "";
    preview.value = undefined;
    confirmed.value = false;
    await loadList();
    if (!live) return;
    emit("changed");
    message.value =
      "Skill de operação publicada. Conceda as capacidades explicitamente aos tokens. Nenhum lançamento foi executado.";
  });
}
async function moreReports() {
  const previous = tests.value;
  if (!previous?.nextCursor) return;
  await run(async () => {
    const result = await props.api<TestDetails>(
      `${root.value}/${selected.value}/testes-operacao?after=${encodeURIComponent(previous.nextCursor!)}`,
    );
    if (!live) return;
    if (
      result.revision !== previous.revision ||
      result.packageHash !== previous.packageHash ||
      result.casesHash !== previous.casesHash
    )
      throw new Error("Conteúdo mudou; recarregue os relatórios.");
    tests.value = { ...result, reports: [...previous.reports, ...result.reports] };
  });
}
function applyAdvanced() {
  try {
    training.value = operationTrainingSchema.parse(JSON.parse(advanced.value));
    advancedOpen.value = false;
    knowledgeDirty.value = false;
    knowledgeKey.value++;
  } catch {
    error.value = "JSON inválido. Preserve a estrutura do contrato de operação.";
  }
}
let initialized = false;
// A lazily mounted editor may arrive while another panel owns the parent lock.
watch(
  () => props.disabled,
  (disabled) => {
    if (!disabled && !initialized && live) {
      initialized = true;
      void run(loadList);
    }
  },
  { immediate: true },
);
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
      <details>
        <summary>Contrato JSON avançado</summary>
        <button
          :disabled="knowledgeDirty"
          type="button"
          @click="
            advanced = JSON.stringify(training, null, 2);
            advancedOpen = true;
          "
        >
          Editar JSON da operação
        </button>
        <template v-if="advancedOpen"
          ><label>JSON da operação<textarea v-model="advanced" /></label
          ><button type="button" @click="applyAdvanced">Aplicar JSON ao rascunho</button
          ><button type="button" @click="advancedOpen = false">
            Fechar JSON sem aplicar
          </button></template
        >
      </details>
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
        :training="training"
        :cases="tests.cases"
        :disabled="busy || disabled || draftDirty || knowledgeDirty || advancedOpen"
        :confirm-discard="confirmDiscard"
        @dirty="caseDirty = $event"
        @save="saveCase"
      />
      <h3>Relatórios do runner</h3>
      <p>
        {{
          tests.requiredApproved
            ? "Relatório técnico atual aprovado; falta revisão semântica e publicação."
            : "Sem relatório obrigatório aprovado e atual. Solicite uma rodada isolada ao operador."
        }}
      </p>
      <p v-if="!tests.reports.length">
        Nenhum relatório registrado. Ausência de relatório não comprova ausência de testes.
      </p>
      <ul>
        <li v-for="report in tests.reports" :key="report.id">
          {{ report.runnerId }} · revisão {{ report.revision }} ·
          {{ new Date(report.createdAt).toLocaleString() }} ·
          {{ report.approved ? "aprovado tecnicamente" : "reprovado" }} ·
          {{ report.current ? "conteúdo atual" : "conteúdo diferente ou não comprovado" }}
          <details>
            <summary>Resultados por caso</summary>
            <ul>
              <li v-for="result in report.results" :key="result.id">
                {{
                  tests.cases.find((c) => c.id === result.id)
                    ? (tests.cases.find((c) => c.id === result.id)!.content as { name: string })
                        .name
                    : result.id
                }}: {{ result.passed ? "passou" : "falhou" }}
              </li>
            </ul>
            <p>Pacote: {{ report.packageHash }}</p>
            <p>Casos: {{ report.casesHash }}</p>
          </details>
        </li>
      </ul>
      <button v-if="tests.nextCursor" :disabled="busy || disabled" @click="moreReports">
        Mais relatórios SQL
      </button>
      <fieldset
        :disabled="busy || disabled || draftDirty || caseDirty || knowledgeDirty || advancedOpen"
      >
        <legend>Revisão e publicação da operação</legend>
        <label
          >Revisar esta operação até<input v-model="reviewDate" type="datetime-local" required
        /></label>
        <button :disabled="!reviewDate || !tests.requiredApproved" @click="review">
          Revisar publicação SQL
        </button>
        <div v-if="preview">
          <PublicationReview :preview="preview" />
          <p>
            Revisão {{ preview.revision }} · prévia válida até
            {{ new Date(preview.expiresAt).toLocaleString() }} · revisão de conhecimento até
            {{ new Date(preview.reviewDueAt).toLocaleString() }}
          </p>
          <p v-for="warning in preview.warnings" :key="warning">{{ warning }}</p>
          <label
            ><input v-model="confirmed" type="checkbox" />Revisei o significado, etapas, limites,
            efeitos indiretos e aprovação desta operação.</label
          >
          <button :disabled="!confirmed" @click="publish">Confirmar publicação SQL</button>
        </div>
      </fieldset>
    </template>
  </section>
</template>
