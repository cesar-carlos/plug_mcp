<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import PublishedKnowledgePicker from "./PublishedKnowledgePicker.vue";
import SourceInspectionPanel from "./SourceInspectionPanel.vue";
import PhysicalProfileEditor from "./PhysicalProfileEditor.vue";
import KnowledgeCurationPanel from "./KnowledgeCurationPanel.vue";
import KnowledgeReviewCalendar from "./KnowledgeReviewCalendar.vue";
import KnowledgeContentSummary from "./KnowledgeContentSummary.vue";
import {
  adoptTraining,
  comparisonSchema,
  issueLabels,
  type KnowledgeSelection,
  type Inspection,
  type Comparison,
  type ProfilePage,
} from "./knowledge-model";
import type { Source, Training } from "./model";
import type { OperationTraining } from "./operation-editor";
import { adoptOperationKnowledge } from "./operation-knowledge";
import { physicalName } from "./knowledge-model";
import { useErrorSummary } from "./useErrorSummary";
const props = defineProps<{
  sources: Source[];
  personaBase: string;
  api: <T>(url: string, body?: unknown) => Promise<T>;
  disabled: boolean;
  confirmDiscard: () => Promise<boolean>;
  training?: Training;
  operationTraining?: OperationTraining;
}>();
const emit = defineEmits<{
  dirty: [value: boolean];
  lock: [value: boolean];
  training: [value: Training];
  operationTraining: [value: OperationTraining];
}>();
const draftTraining = computed(() => props.operationTraining ?? props.training);
const sourceId = ref(draftTraining.value?.sourceId ?? "");
const source = computed(() => props.sources.find((s) => s.id === sourceId.value));
const sourceBase = computed(() => `${props.personaBase}/fontes/${sourceId.value}`);
const selection = ref<KnowledgeSelection>(),
  inspection = ref<Inspection>(),
  comparison = ref<Comparison>();
const page = ref<ProfilePage>({
  drafts: [],
  publications: [],
  nextDraftCursor: null,
  nextPublicationCursor: null,
});
const curator = ref(false),
  curationDirty = ref(false),
  reviewDirty = ref(false),
  inspectionDirty = ref(false),
  profileDirty = ref(false),
  pendingAdoption = ref(false),
  busy = ref(false),
  profileKey = ref(0),
  workspaceKey = ref(0);
const tables = ref<string[]>([]),
  fields = ref<string[]>([]),
  confirmed = ref(false),
  message = ref("");
const picker = ref<InstanceType<typeof PublishedKnowledgePicker>>();
const { error, errorSummary } = useErrorSummary();
let live = true,
  epoch = 0;
const dirty = computed(
  () =>
    inspectionDirty.value ||
    profileDirty.value ||
    pendingAdoption.value ||
    curationDirty.value ||
    reviewDirty.value,
);
watch(dirty, (value) => emit("dirty", value), { immediate: true });
onBeforeUnmount(() => {
  live = false;
  epoch++;
  emit("dirty", false);
});
const content = computed(
  () => selection.value?.profile?.content ?? selection.value?.standard.content,
);
const selectionKey = computed(() =>
  JSON.stringify([
    selection.value?.catalogId,
    selection.value?.standard.id,
    selection.value?.standard.hash,
    selection.value?.standard.suspendedAt,
    selection.value?.profile?.publicationId,
    selection.value?.profile?.hash,
    selection.value?.profile?.suspended,
  ]),
);
const selectedTables = computed(
  () =>
    content.value?.tables
      .filter((t) => tables.value.includes(t.id))
      .map((t) => ({
        id: t.id,
        columns: t.columns
          .filter((c) => fields.value.includes(`${t.id}.${c.name}`))
          .map((c) => c.name),
      })) ?? [],
);
const inspectionContent = computed(() =>
  draftTraining.value && tables.value.length && content.value
    ? { ...content.value, tables: content.value.tables.filter((t) => tables.value.includes(t.id)) }
    : content.value,
);
const comparisonKey = computed(() =>
  JSON.stringify([
    selectionKey.value,
    inspection.value?.id,
    draftTraining.value ? selectedTables.value : undefined,
    props.operationTraining,
  ]),
);
watch(comparisonKey, () => {
  epoch++;
  comparison.value = undefined;
  confirmed.value = false;
});
watch(selectionKey, () => {
  tables.value = [];
  fields.value = [];
});
watch(
  () => draftTraining.value?.sourceId,
  (value) => {
    if (value !== undefined && value !== sourceId.value) {
      sourceId.value = value;
      reset();
    }
  },
);
function reset() {
  epoch++;
  selection.value = undefined;
  inspection.value = undefined;
  comparison.value = undefined;
  page.value = { drafts: [], publications: [], nextDraftCursor: null, nextPublicationCursor: null };
  inspectionDirty.value = false;
  profileDirty.value = false;
  curationDirty.value = false;
  reviewDirty.value = false;
  pendingAdoption.value = false;
  tables.value = [];
  fields.value = [];
  workspaceKey.value++;
  message.value = "";
  error.value = "";
}
async function chooseSource(event: Event) {
  const input = event.target as HTMLSelectElement;
  if (dirty.value && !(await props.confirmDiscard())) {
    input.value = sourceId.value;
    return;
  }
  sourceId.value = input.value;
  reset();
}
async function discardPending() {
  if (dirty.value && !(await props.confirmDiscard())) return;
  reset();
}
async function beforeSelectionChange() {
  if (
    (profileDirty.value ||
      curationDirty.value ||
      reviewDirty.value ||
      (pendingAdoption.value && tables.value.length > 0)) &&
    !(await props.confirmDiscard())
  )
    return false;
  profileKey.value++;
  profileDirty.value = false;
  pendingAdoption.value = false;
  return true;
}
async function compare() {
  if (busy.value || props.disabled || !selection.value || !inspection.value) return;
  error.value = "";
  comparison.value = undefined;
  const version = epoch;
  busy.value = true;
  emit("lock", true);
  try {
    if (
      draftTraining.value &&
      (!selectedTables.value.length || selectedTables.value.some((t) => !t.columns.length))
    )
      throw new Error("Selecione as tabelas e os campos utilizados antes de comparar.");
    const data = comparisonSchema.parse(
      await props.api<unknown>(`${sourceBase.value}/compatibilidade`, {
        catalogId: selection.value.catalogId,
        publicationId: selection.value.standard.id,
        evidenceId: inspection.value.id,
        ...(selection.value.profile
          ? { profilePublicationId: selection.value.profile.publicationId }
          : {}),
        ...(draftTraining.value ? { selectedTables: selectedTables.value } : {}),
      }),
    );
    if (live && epoch === version) comparison.value = data;
  } catch (cause) {
    if (live && epoch === version)
      error.value = cause instanceof Error ? cause.message : "Não foi possível comparar.";
  } finally {
    if (live) busy.value = false;
    emit("lock", false);
  }
}
function apply() {
  error.value = "";
  if (
    !draftTraining.value ||
    !selection.value ||
    !inspection.value ||
    comparison.value?.status !== "compatible" ||
    !confirmed.value
  )
    return;
  try {
    if (props.operationTraining)
      emit(
        "operationTraining",
        adoptOperationKnowledge(
          props.operationTraining,
          selection.value,
          inspection.value,
          tables.value,
          fields.value,
        ),
      );
    else if (props.training)
      emit(
        "training",
        adoptTraining(
          props.training,
          selection.value,
          inspection.value,
          tables.value,
          fields.value,
        ),
      );
    pendingAdoption.value = false;
    confirmed.value = false;
    message.value =
      "Conhecimento aplicado somente ao rascunho. Salve, revise os testes e publique a skill; tokens não recebem concessões novas automaticamente.";
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "Revise a seleção.";
  }
}
function selectAll() {
  if (!content.value) return;
  const selectable = content.value.tables.filter(tableAllowed);
  tables.value = selectable.map((t) => t.id);
  fields.value = selectable.flatMap((t) =>
    t.columns
      .filter((c) => c.classification === "livre" && fieldAllowed(t, c.name))
      .map((c) => `${t.id}.${c.name}`),
  );
  pendingAdoption.value = true;
}
function removeReference() {
  if (!draftTraining.value) return;
  const privateTraining = { ...draftTraining.value };
  delete privateTraining.sharedKnowledge;
  if (props.operationTraining) emit("operationTraining", privateTraining as OperationTraining);
  else emit("training", privateTraining as Training);
  pendingAdoption.value = false;
  message.value =
    "Referência removida somente do rascunho. O conteúdo privado foi preservado; publicação e tokens permanecem sujeitos à revisão.";
}
function tableAllowed(table: NonNullable<typeof content.value>["tables"][number]) {
  return (
    !props.operationTraining ||
    props.operationTraining.tables.some(
      (t) => t.name === physicalName(table, props.operationTraining!.dialect),
    )
  );
}
function fieldAllowed(table: NonNullable<typeof content.value>["tables"][number], name: string) {
  return (
    !props.operationTraining ||
    props.operationTraining.tables.some(
      (t) =>
        t.name === physicalName(table, props.operationTraining!.dialect) &&
        t.columns.some((c) => c.name === name),
    )
  );
}
const statusLabel = {
  compatible: "Estrutura compatível",
  incompatible: "Estrutura incompatível",
  inconclusive: "Compatibilidade inconclusiva",
};
function resourceLabel(id: string) {
  return (
    content.value?.tables.find((t) => t.id === id)?.name ??
    content.value?.relationships.find((r) => r.id === id)?.meaning ??
    id
  );
}
async function reload() {
  await nextTick();
  await picker.value?.reloadProfiles();
}
</script>
<template>
  <section
    :aria-label="
      operationTraining
        ? 'Adoção de conhecimento na operação'
        : draftTraining
          ? 'Adoção de conhecimento na skill'
          : 'Conhecimento das bases da persona'
    "
  >
    <h2 v-if="!draftTraining">Conhecimento da persona</h2>
    <h3 v-else>
      {{
        operationTraining
          ? "Conhecimento compartilhado desta operação"
          : "Conhecimento compartilhado desta consulta"
      }}
    </h3>
    <p>
      Escolha uma versão publicada, inspecione a base e confira a compatibilidade. Nenhum padrão ou
      perfil é adotado automaticamente.
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
        @touched="pendingAdoption = !!draftTraining"
      />
      <p v-if="selection?.profile" class="notice">
        Perfil selecionado: {{ selection.profile.name }} · revisão {{ selection.profile.revision }}.
        Vinculado somente a esta identidade física.
      </p>
      <details v-if="!draftTraining && content">
        <summary>Conhecimento publicado selecionado</summary>
        <KnowledgeContentSummary :content="content" :dialect="source.dialect" />
      </details>
      <template v-if="draftTraining && content">
        <fieldset :disabled="disabled || busy">
          <legend>
            {{
              operationTraining
                ? "Tabelas e campos declarados na operação"
                : "Tabelas e campos necessários à consulta"
            }}
          </legend>
          <p v-if="!operationTraining">
            A aplicação substitui as definições de estrutura e relacionamentos do rascunho; SQL,
            exemplos e parâmetros são preservados. Inclua grão e chaves utilizadas. A prova inicial
            usa uma evidência individual ou páginas explicitamente combinadas, até dezesseis
            recursos.
          </p>
          <p v-else>
            Selecione todas e somente as tabelas e colunas já declaradas na operação. A adoção
            atualiza significado, grão, regras e relacionamentos; preserva tipos, identidade,
            concorrência, parâmetros, etapas e permissões de escrita. Cadastre recursos faltantes
            antes de adotar. PK/UNIQUE, FKs e tipos ainda serão conferidos pelo servidor na
            publicação.
          </p>
          <button type="button" class="secondary" @click="selectAll">
            Selecionar tabelas e campos livres
          </button>
          <fieldset v-for="table in content.tables" :key="table.id">
            <legend>{{ table.name }} — {{ table.meaning }}</legend>
            <label class="check"
              ><input
                v-model="tables"
                type="checkbox"
                :value="table.id"
                :disabled="!tableAllowed(table)"
                @change="pendingAdoption = true"
              />Usar tabela {{ table.name }}</label
            ><template v-if="tables.includes(table.id)"
              ><label v-for="column in table.columns" :key="column.name" class="check"
                ><input
                  v-model="fields"
                  type="checkbox"
                  :value="`${table.id}.${column.name}`"
                  :disabled="
                    !fieldAllowed(table, column.name) ||
                    (operationTraining
                      ? column.classification !== 'livre'
                      : ['segredo', 'inferido'].includes(column.classification))
                  "
                  @change="pendingAdoption = true"
                />{{ column.name }} — {{ column.meaning
                }}{{
                  ["segredo", "inferido"].includes(column.classification)
                    ? " (não executável)"
                    : column.classification !== "livre"
                      ? " (configure finalidades e justificativa no treinamento antes de publicar)"
                      : ""
                }}</label
              ></template
            >
          </fieldset>
        </fieldset>
      </template>
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
      <section v-if="selection" aria-label="Compatibilidade do conhecimento">
        <h3>Conferir compatibilidade</h3>
        <p>
          Compara fatos técnicos com
          {{
            selection.profile
              ? `${selection.profile.name} · revisão ${selection.profile.revision}`
              : `${selection.standard.content.system} · ${selection.standard.content.label}`
          }}. Compatibilidade não concede execução nem substitui revisão de negócio.
        </p>
        <button
          type="button"
          :disabled="
            disabled ||
            busy ||
            !inspection ||
            !!selection.profile?.suspended ||
            !!selection.standard.suspendedAt
          "
          @click="compare"
        >
          Verificar compatibilidade
        </button>
        <template v-if="comparison"
          ><h4 aria-live="polite">
            {{ statusLabel[comparison.status] }}
          </h4>
          <p v-if="comparison.status === 'compatible'">
            As dependências selecionadas foram comprovadas. Ainda é necessário salvar, testar,
            publicar e conceder a skill.
          </p>
          <ul v-else>
            <li v-for="(issue, index) in comparison.issues" :key="index">
              <strong
                >{{ resourceLabel(issue.resource)
                }}{{ issue.field ? ` · ${issue.field}` : "" }}</strong
              >:
              {{
                issueLabels[issue.code] ??
                "Dependência sem comprovação. Revise a versão publicada e a evidência."
              }}
            </li>
          </ul></template
        >
        <p v-if="!inspection" class="notice">
          Inspecione o escopo para obter uma evidência vigente antes de comparar.
        </p>
      </section>
      <template v-if="draftTraining && selection && content">
        <p v-if="content.relationships.some((r) => r.via.length > 0)" class="notice">
          Caminhos N:N conservam tabelas intermediárias e todos os elos selecionados. Somente esses
          elos diretos entram na validação do SQL; o caminho não autoriza JOIN entre as
          extremidades. Revise a seleção e a prova física antes de publicar.
        </p>
        <KnowledgeContentSummary :content="content" :dialect="source.dialect" />
        <label class="check"
          ><input
            v-model="confirmed"
            type="checkbox"
            :disabled="disabled || busy || comparison?.status !== 'compatible'"
          />{{
            operationTraining
              ? "Revisei a adoção estrutural sem alteração das etapas, parâmetros e permissões de escrita."
              : "Revisei a estrutura, os relacionamentos e as regras que substituirão o conteúdo do rascunho."
          }}</label
        >
        <button
          type="button"
          :disabled="disabled || busy || comparison?.status !== 'compatible' || !confirmed"
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
