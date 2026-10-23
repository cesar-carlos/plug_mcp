<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from "vue";
import type {
  SkillDraft,
  PublicationPreviewResult,
  OperationTestDetails,
  CatalogPublication,
  PublishedPackage,
} from "../../../src/domain/persona-v2/catalog";
import {
  federationTrainingSchema,
  type FederationTraining,
} from "../../../src/domain/persona-v2/federation-training";
import type { Source, Training } from "./model";
import { emptyFederation } from "./federation-editor";
import FederationStepsEditor from "./FederationStepsEditor.vue";
import type { QueryDependency } from "./federation-editor";
import FederationCasesPanel from "./FederationCasesPanel.vue";
import PublicationReview from "./PublicationReview.vue";
import LimitsEditor from "./LimitsEditor.vue";
import { publicationDeadline } from "./publication-deadline";
import { useEditorErrors } from "./useEditorErrors";
const props = defineProps<{
  api: <T>(url: string, body?: unknown) => Promise<T>;
  base: string;
  sources: Source[];
  disabled: boolean;
  confirmDiscard: () => Promise<boolean>;
}>();
const emit = defineEmits<{ dirty: [boolean]; lock: [boolean]; changed: [] }>();
const drafts = ref<SkillDraft[]>([]),
  publications = ref<QueryDependency[]>([]),
  selected = ref(""),
  revision = ref(0),
  name = ref(""),
  slug = ref("");
const training = ref(emptyFederation()),
  saved = ref(""),
  busy = ref(false),
  message = ref(""),
  caseDirty = ref(false),
  caseKey = ref(0),
  reviewDate = ref(""),
  confirmed = ref(false);
const tests = ref<OperationTestDetails>(),
  preview = ref<PublicationPreviewResult>(),
  active = ref<CatalogPublication<PublishedPackage> | null>(null),
  advanced = ref(""),
  advancedOpen = ref(false);
const semantics = {
  matching: "Correspondência de registros",
  normalization: "Normalização das chaves",
  missing: "Ausência de registros",
  duplicates: "Duplicidades e grão",
  units: "Unidades",
  currency: "Moedas",
  calendar: "Calendário",
};
const { error, errorSummary, root: editorRoot, errorId, capture, invalid } = useEditorErrors();
let live = true,
  initialized = false;
const root = computed(() => `${props.base}/skills`);
const fingerprint = computed(() =>
  JSON.stringify({ name: name.value, slug: slug.value, training: training.value }),
);
saved.value = fingerprint.value;
const draftDirty = computed(() => fingerprint.value !== saved.value);
const dirty = computed(
  () =>
    draftDirty.value ||
    caseDirty.value ||
    !!reviewDate.value ||
    (advancedOpen.value && advanced.value !== JSON.stringify(training.value, null, 2)),
);
watch(dirty, (v) => emit("dirty", v), { immediate: true });
watch([fingerprint, reviewDate], () => {
  preview.value = undefined;
  confirmed.value = false;
});
onBeforeUnmount(() => {
  live = false;
  training.value = emptyFederation();
  tests.value = undefined;
  preview.value = undefined;
  emit("dirty", false);
  emit("lock", false);
});
async function run(fn: () => Promise<void>) {
  if (!live || busy.value || props.disabled) {
    return;
  }
  busy.value = true;
  emit("lock", true);
  error.value = "";
  message.value = "";
  try {
    await fn();
  } catch (cause) {
    if (live) {
      capture(cause);
    }
  } finally {
    busy.value = false;
    if (live) {
      emit("lock", false);
    }
  }
}
async function loadList() {
  const result = await props.api<{ skills: SkillDraft[] }>(root.value);
  if (!live) {
    return;
  }
  drafts.value = result.skills.filter((s) => s.kind === "cruzamento");
  const candidates = await Promise.all(
    result.skills
      .filter((s) => s.kind === "consulta" && s.activePublicationId)
      .map(async (s) => {
        const { publication: p } = await props.api<{
          publication: CatalogPublication<PublishedPackage> | null;
        }>(`${root.value}/${s.id}/publicacao`);
        if (!p || p.suspendedAt || p.package.format !== "persona-query-v2") {
          return null;
        }
        const sourceId = p.package.sourceId;
        const source = props.sources.find((source) => source.id === sourceId);
        if (!source?.active) {
          return null;
        }
        return {
          id: p.id,
          sourceId: source.id,
          name: p.package.name,
          revision: p.revision,
          sourceName: source.name,
          dialect: source.dialect,
          training: p.package.training as Training,
        };
      }),
  );
  if (live) {
    publications.value = candidates.filter((p) => p !== null);
  }
}
async function loadTests() {
  const result = await props.api<OperationTestDetails>(
    `${root.value}/${selected.value}/testes-cruzamento`,
  );
  if (live) {
    tests.value = result;
    revision.value = result.revision;
  }
}
async function loadDraft(id: string) {
  if (!live) {
    return;
  }
  const draft = drafts.value.find((d) => d.id === id);
  selected.value = id;
  revision.value = draft?.revision ?? 0;
  name.value = draft?.name ?? "";
  slug.value = draft?.slug ?? "";
  training.value = draft
    ? (JSON.parse(JSON.stringify(draft.training)) as FederationTraining)
    : emptyFederation();
  saved.value = fingerprint.value;
  tests.value = undefined;
  active.value = null;
  caseDirty.value = false;
  caseKey.value++;
  reviewDate.value = "";
  confirmed.value = false;
  preview.value = undefined;
  advancedOpen.value = false;
  if (id) {
    await loadTests();
    if (!live) {
      return;
    }
    const result = await props.api<{ publication: CatalogPublication<PublishedPackage> | null }>(
      `${root.value}/${id}/publicacao`,
    );
    if (live) {
      active.value = result.publication;
    }
  }
}
async function select(event: Event) {
  const input = event.target as HTMLSelectElement,
    id = input.value;
  input.value = selected.value;
  if (dirty.value && !(await props.confirmDiscard())) {
    return;
  }
  await run(() => loadDraft(id));
}
async function refresh() {
  if (dirty.value && !(await props.confirmDiscard())) {
    return;
  }
  await run(async () => {
    await loadList();
    await loadDraft(selected.value);
  });
}
async function save() {
  if (caseDirty.value || advancedOpen.value) {
    return;
  }
  await run(async () => {
    const parsed = federationTrainingSchema.safeParse(training.value);
    if (!parsed.success) {
      throw new Error(
        "Revise finalidade, regras de combinação, dependências, colunas e etapas do cruzamento.",
      );
    }
    const result = selected.value
      ? await props.api<{ skill: SkillDraft }>(`${root.value}/${selected.value}/rascunho`, {
          name: name.value,
          training: parsed.data,
          expectedRevision: revision.value,
        })
      : await props.api<{ skill: SkillDraft }>(root.value, {
          name: name.value,
          slug: slug.value,
          kind: "cruzamento",
          training: parsed.data,
        });
    if (!live) {
      return;
    }
    selected.value = result.skill.id;
    revision.value = result.skill.revision;
    saved.value = fingerprint.value;
    await loadList();
    await loadTests();
    if (live) {
      emit("changed");
      message.value = "Rascunho de cruzamento salvo. Publicação e permissões preservadas.";
    }
  });
}
async function saveCase(input: {
  id?: string;
  remove: boolean;
  required: boolean;
  content: unknown;
}) {
  await run(async () => {
    await props.api(`${root.value}/${selected.value}/casos-cruzamento`, {
      ...input,
      expectedRevision: revision.value,
    });
    if (!live) {
      return;
    }
    caseDirty.value = false;
    caseKey.value++;
    preview.value = undefined;
    confirmed.value = false;
    await loadList();
    await loadTests();
    if (live) {
      message.value = "Caso de cruzamento salvo. Solicite uma rodada atual ao operador.";
    }
  });
}
async function review() {
  if (draftDirty.value || caseDirty.value || advancedOpen.value) {
    return;
  }
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
    advancedOpen.value
  ) {
    return;
  }
  const confirmationHash = preview.value.confirmationHash;
  await run(async () => {
    const result = await props.api<{ publication: CatalogPublication<PublishedPackage> }>(
      `${root.value}/${selected.value}/publicar`,
      { confirmationHash },
    );
    if (!live) {
      return;
    }
    active.value = result.publication;
    reviewDate.value = "";
    preview.value = undefined;
    confirmed.value = false;
    await loadList();
    if (live) {
      emit("changed");
      message.value =
        "Cruzamento publicado. Conceda o cruzamento e cada consulta e base dependente explicitamente aos tokens.";
    }
  });
}
async function moreReports() {
  const previous = tests.value;
  if (!previous?.nextCursor) {
    return;
  }
  await run(async () => {
    const result = await props.api<OperationTestDetails>(
      `${root.value}/${selected.value}/testes-cruzamento?after=${encodeURIComponent(previous.nextCursor!)}`,
    );
    if (!live) {
      return;
    }
    if (
      result.revision !== previous.revision ||
      result.packageHash !== previous.packageHash ||
      result.casesHash !== previous.casesHash
    ) {
      throw new Error("Conteúdo mudou; recarregue os relatórios.");
    }
    tests.value = { ...result, reports: [...previous.reports, ...result.reports] };
  });
}
function applyAdvanced() {
  try {
    training.value = federationTrainingSchema.parse(JSON.parse(advanced.value));
    advancedOpen.value = false;
  } catch {
    error.value = "JSON inválido. Preserve o contrato tipado de cruzamento.";
  }
}
// Another editor may own the parent lock during mounting. Initialize once it is released.
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
  <section ref="editorRoot" aria-label="Treinamento de cruzamento">
    <h2>Treinar cruzamentos</h2>
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
          <option v-for="d in drafts" :key="d.id" :value="d.id">
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
        <label
          >Finalidade do cruzamento<textarea v-model="training.purpose" required maxlength="4000" />
        </label>
        <fieldset>
          <legend>Significado da combinação</legend>
          <label v-for="(label, key) in semantics" :key="key"
            >{{ label }}<textarea v-model="training.semantics[key]" required />
          </label>
        </fieldset>
        <FederationStepsEditor v-model="training.steps" :publications="publications" />
        <label
          >Etapa de saída<select v-model="training.output" required>
            <option value="">Selecione</option>
            <option v-for="step in training.steps" :key="step.id" :value="step.id">
              {{ step.id }}
            </option>
            <option
              v-if="training.output && !training.steps.some((s) => s.id === training.output)"
              :value="training.output"
            >
              {{ training.output }} · referência inválida
            </option>
          </select></label
        >
        <LimitsEditor
          :model-value="training.budget"
          kind="federation"
          label="Limites do cruzamento"
          @update:model-value="training.budget = $event ?? {}"
        />
        <p v-if="draftDirty">Há alterações não salvas no cruzamento.</p>
        <button :disabled="advancedOpen">Salvar cruzamento</button>
      </form>
      <details>
        <summary>Contrato JSON avançado do cruzamento</summary>
        <button
          type="button"
          @click="
            advanced = JSON.stringify(training, null, 2);
            advancedOpen = true;
          "
        >
          Editar JSON do cruzamento</button
        ><template v-if="advancedOpen"
          ><label>JSON do cruzamento<textarea v-model="advanced" /></label
          ><button type="button" @click="applyAdvanced">Aplicar JSON do cruzamento</button
          ><button type="button" @click="advancedOpen = false">
            Fechar JSON do cruzamento
          </button></template
        >
      </details>
    </fieldset>
    <template v-if="selected && tests">
      <FederationCasesPanel
        :key="caseKey"
        :training="training"
        :publications="publications"
        :cases="tests.cases"
        :disabled="busy || disabled || draftDirty || advancedOpen"
        :confirm-discard="confirmDiscard"
        @dirty="caseDirty = $event"
        @save="saveCase"
      />
      <h3>Relatórios do cruzamento</h3>
      <p>
        {{
          tests.requiredApproved
            ? "Relatório obrigatório atual aprovado; revise o significado antes de publicar."
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
            <summary>Resultados dos casos de cruzamento</summary>
            <ul>
              <li v-for="result in report.results" :key="result.id">
                {{ result.id }}: {{ result.passed ? "passou" : "falhou" }}
              </li>
            </ul>
            <p>Pacote: {{ report.packageHash }}</p>
            <p>Casos: {{ report.casesHash }}</p>
          </details>
        </li>
      </ul>
      <button v-if="tests.nextCursor" :disabled="busy || disabled" @click="moreReports">
        Mais relatórios de cruzamento
      </button>
      <fieldset :disabled="busy || disabled || draftDirty || caseDirty || advancedOpen">
        <legend>Revisão e publicação do cruzamento</legend>
        <label
          >Revisar este cruzamento até<input v-model="reviewDate" type="datetime-local" required
        /></label>
        <button :disabled="!reviewDate || !tests.requiredApproved" @click="review">
          Revisar publicação do cruzamento
        </button>
        <div v-if="preview">
          <PublicationReview :preview="preview" />
          <p>
            Prévia válida até {{ new Date(preview.expiresAt).toLocaleString() }} · revisão até
            {{ new Date(preview.reviewDueAt).toLocaleString() }}
          </p>
          <p v-for="warning in preview.warnings" :key="warning">{{ warning }}</p>
          <label
            ><input v-model="confirmed" type="checkbox" />Revisei correspondência, cardinalidade,
            ausência, duplicidades, unidades e completude do cruzamento.</label
          ><button :disabled="!confirmed" @click="publish">
            Confirmar publicação do cruzamento
          </button>
        </div>
      </fieldset>
    </template>
  </section>
</template>
