<script setup lang="ts">
import { computed, reactive, ref, shallowRef, watch, onBeforeUnmount } from "vue";
import {
  externalContractSchema,
  type ExternalContract,
} from "../../../src/domain/persona-v2/external-contract";
import type {
  ExternalDraftDetails,
  ExternalDraftSummary,
  ExternalPublicationPreview,
  ExternalTestDetails,
} from "../../../src/domain/persona-v2/external-run";
import type { IntegrationReference } from "../../../src/domain/persona-v2/integration-credential";
import { canonicalJson } from "../../../src/domain/persona-v2/catalog";
import {
  emptyExternalContract,
  newExternalContractFrom,
  editableExternalContract,
} from "./external-editor";
import { publicationDeadline } from "./publication-deadline";
import { useEditorErrors } from "./useEditorErrors";
import ExternalContractFields from "./ExternalContractFields.vue";
import ExternalTestsPanel from "./ExternalTestsPanel.vue";
import PublicationReview from "./PublicationReview.vue";
import ExternalImportPanel from "./ExternalImportPanel.vue";
import type {
  ExternalImportCandidate,
  ExternalImportResult,
} from "../../../src/domain/persona-v2/external-import";
const props = defineProps<{
  api: <T>(url: string, body?: unknown) => Promise<T>;
  base: string;
  disabled: boolean;
  confirmDiscard: () => Promise<boolean>;
}>();
const emit = defineEmits<{ dirty: [boolean]; lock: [boolean]; changed: [] }>();
const drafts = ref<readonly ExternalDraftSummary[]>([]),
  connections = ref<readonly (IntegrationReference & { active: boolean })[]>([]),
  selected = ref(""),
  name = ref(""),
  slug = ref(""),
  revision = ref(0),
  contract = shallowRef<ExternalContract>(editableExternalContract(emptyExternalContract()));
const busy = ref(false),
  caseBusy = ref(false),
  caseDirty = ref(false),
  caseKey = ref(0),
  fieldsKey = ref(0),
  saved = ref(""),
  message = ref(""),
  published = ref(false),
  staleContract = ref(false),
  active = shallowRef<ExternalDraftDetails["publication"]>(null);
const pending = reactive<Record<string, boolean>>({}),
  tests = shallowRef<ExternalTestDetails>(),
  reviewDate = ref(""),
  confirmed = ref(false),
  preview = shallowRef<ExternalPublicationPreview>();
const advanced = ref(""),
  advancedOpen = ref(false);
const importDirty = ref(false),
  importPanel = ref<InstanceType<typeof ExternalImportPanel>>(),
  importConnection = ref<ExternalImportResult["connection"]>();
const { error, errorSummary, root: editorRoot, errorId, capture, invalid } = useEditorErrors();
let live = true,
  initialized = false;
const root = computed(() => `${props.base}/integracoes/skills`),
  fingerprint = computed(() =>
    JSON.stringify({
      name: name.value,
      slug: slug.value,
      contract: contract.value,
      importConnection: importConnection.value,
    }),
  );
saved.value = fingerprint.value;
const draftDirty = computed(() => fingerprint.value !== saved.value),
  pendingFields = computed(() => Object.values(pending).some(Boolean));
const dirty = computed(
  () =>
    draftDirty.value ||
    importDirty.value ||
    pendingFields.value ||
    caseDirty.value ||
    !!reviewDate.value ||
    (advancedOpen.value && advanced.value !== JSON.stringify(contract.value, null, 2)),
);
watch(dirty, (v) => emit("dirty", v), { immediate: true });
watch([fingerprint, reviewDate, pendingFields], () => {
  preview.value = undefined;
  confirmed.value = false;
});
onBeforeUnmount(() => {
  live = false;
  contract.value = emptyExternalContract();
  tests.value = undefined;
  preview.value = undefined;
  emit("dirty", false);
  emit("lock", false);
});
async function run(fn: () => Promise<void>) {
  if (!live || busy.value || caseBusy.value || props.disabled) {
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
function clearPending() {
  for (const key of Object.keys(pending)) {
    delete pending[key];
  }
  fieldsKey.value++;
}
async function loadList() {
  const [skills, integrations] = await Promise.all([
    props.api<{ skills: readonly ExternalDraftSummary[] }>(root.value),
    props.api<{ connections: typeof connections.value }>(`${props.base}/integracoes/conexoes`),
  ]);
  if (live) {
    drafts.value = skills.skills;
    connections.value = integrations.connections;
  }
}
async function loadDraft(id: string) {
  const d = id ? await props.api<ExternalDraftDetails>(`${root.value}/${id}/rascunho`) : undefined;
  if (!live) {
    return;
  }
  selected.value = id;
  importConnection.value = undefined;
  name.value = d?.name ?? "";
  slug.value = d?.slug ?? "";
  revision.value = d?.revision ?? 0;
  contract.value = editableExternalContract(
    d ? (JSON.parse(JSON.stringify(d.contract)) as ExternalContract) : emptyExternalContract(),
  );
  published.value = d?.published ?? false;
  active.value = d?.publication ?? null;
  saved.value = fingerprint.value;
  staleContract.value = false;
  clearPending();
  tests.value = undefined;
  caseDirty.value = false;
  caseKey.value++;
  reviewDate.value = "";
  preview.value = undefined;
  confirmed.value = false;
  advancedOpen.value = false;
}
async function select(event: Event) {
  const input = event.target as HTMLSelectElement,
    next = input.value;
  input.value = selected.value;
  if (dirty.value && !(await props.confirmDiscard())) {
    return;
  }
  await run(() => loadDraft(next));
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
  if (
    published.value ||
    staleContract.value ||
    pendingFields.value ||
    caseDirty.value ||
    advancedOpen.value
  ) {
    return;
  }
  await run(async () => {
    const parsed = externalContractSchema.safeParse(contract.value);
    if (!parsed.success) {
      throw new Error(
        "Revise integração, transporte, campos, efeitos e conciliação. O contrato deve corresponder exatamente ao serviço remoto.",
      );
    }
    if (selected.value) {
      await props.api(`${root.value}/${selected.value}/rascunho`, {
        expectedRevision: revision.value,
        name: name.value,
        contract: parsed.data,
      });
    } else {
      const result = await props.api<{ skillId: string; operationId: string }>(root.value, {
        name: name.value,
        slug: slug.value,
        contract: parsed.data,
        ...(importConnection.value ? { expectedConnection: importConnection.value } : {}),
      });
      if (!live) {
        return;
      }
      selected.value = result.skillId;
    }
    await loadList();
    await loadDraft(selected.value);
    if (live) {
      emit("changed");
      message.value =
        "Rascunho externo salvo. Execute casos em fixture isolada antes da revisão. Nenhuma chamada externa foi enviada.";
    }
  });
}
async function copy() {
  if (dirty.value && !(await props.confirmDiscard())) {
    return;
  }
  if (!live || busy.value || caseBusy.value || props.disabled) {
    return;
  }
  const previous = contract.value;
  importConnection.value = undefined;
  selected.value = "";
  revision.value = 0;
  published.value = false;
  staleContract.value = false;
  active.value = null;
  contract.value = editableExternalContract(newExternalContractFrom(previous));
  slug.value = "";
  saved.value = "";
  clearPending();
  tests.value = undefined;
  caseDirty.value = false;
  caseKey.value++;
  preview.value = undefined;
  confirmed.value = false;
  reviewDate.value = "";
  advancedOpen.value = false;
  message.value =
    "Escolha novo identificador e revise o contrato. A nova skill receberá outra operação, sem casos, relatórios ou concessões herdados.";
}
async function applyImport(
  candidate: ExternalImportCandidate,
  connection: ExternalImportResult["connection"],
) {
  if (!candidate.proposal || busy.value || caseBusy.value || props.disabled) return;
  if (
    (draftDirty.value ||
      pendingFields.value ||
      caseDirty.value ||
      advancedOpen.value ||
      reviewDate.value) &&
    !(await props.confirmDiscard())
  )
    return;
  if (!live) return;
  await loadDraft("");
  if (!live) return;
  name.value = candidate.name;
  importConnection.value = connection;
  contract.value = editableExternalContract({
    ...emptyExternalContract(),
    ...candidate.proposal,
    integrationId: connection.id,
    ...(candidate.proposal.effect === "consulta"
      ? { approval: undefined, effectDescription: undefined, reconciliation: undefined }
      : {}),
  });
  importPanel.value?.clear();
  message.value =
    "Proposta aplicada somente ao formulário. Revise finalidade, campos, classificação, efeitos e conciliação antes de salvar o rascunho. Não há publicação ou concessões herdadas.";
}
function caseLock(value: boolean) {
  if (live) {
    caseBusy.value = value;
    emit("lock", value);
  }
}
function caseUpdated(value: ExternalTestDetails) {
  if (!live) {
    return;
  }
  if (
    canonicalJson(value.contract) !== canonicalJson(contract.value) ||
    value.name !== name.value
  ) {
    staleContract.value = true;
    tests.value = undefined;
    preview.value = undefined;
    confirmed.value = false;
    error.value =
      "Contrato mudou em outra sessão. Preserve sua edição e recarregue a skill antes de continuar.";
    return;
  }
  if (
    tests.value &&
    (tests.value.revision !== value.revision ||
      tests.value.packageHash !== value.packageHash ||
      tests.value.casesHash !== value.casesHash)
  ) {
    preview.value = undefined;
    confirmed.value = false;
  }
  tests.value = value;
  revision.value = value.revision;
}
async function review() {
  if (
    draftDirty.value ||
    pendingFields.value ||
    caseDirty.value ||
    advancedOpen.value ||
    published.value
  ) {
    return;
  }
  await run(async () => {
    const result = await props.api<ExternalPublicationPreview>(
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
    pendingFields.value ||
    caseDirty.value ||
    advancedOpen.value ||
    published.value
  ) {
    return;
  }
  const confirmationHash = preview.value.confirmationHash;
  await run(async () => {
    await props.api(`${root.value}/${selected.value}/publicar`, { confirmationHash });
    if (!live) {
      return;
    }
    await loadList();
    await loadDraft(selected.value);
    if (live) {
      emit("changed");
      message.value =
        "Skill externa publicada. Conceda skill, operação e capacidade exatas aos tokens. Publicação não envia nem aprova ações.";
    }
  });
}
function applyAdvanced() {
  try {
    const parsed = externalContractSchema.parse(JSON.parse(advanced.value));
    if (parsed.operationId !== contract.value.operationId) {
      throw new Error("identity");
    }
    contract.value = editableExternalContract(parsed);
    advancedOpen.value = false;
    clearPending();
  } catch {
    error.value =
      "JSON inválido ou identidade alterada. Preserve a operação atribuída pelo servidor e o contrato estrito.";
  }
}
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
  <section ref="editorRoot" aria-label="Treinamento de ação externa">
    <h2>Treinar ações e consultas externas</h2>
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
          <option v-for="d in drafts" :key="d.skillId" :value="d.skillId">
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
      <details v-if="!published">
        <summary>Contrato externo JSON avançado</summary>
        <button
          type="button"
          :disabled="pendingFields"
          @click="
            advanced = JSON.stringify(contract, null, 2);
            advancedOpen = true;
          "
        >
          Editar JSON da skill externa</button
        ><template v-if="advancedOpen"
          ><label>JSON da skill externa<textarea v-model="advanced" /></label
          ><button type="button" @click="applyAdvanced">Aplicar JSON da skill externa</button
          ><button type="button" @click="advancedOpen = false">
            Fechar JSON da skill externa
          </button></template
        >
      </details>
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
    <fieldset
      v-if="selected && !published"
      :disabled="
        busy || disabled || caseBusy || draftDirty || pendingFields || caseDirty || advancedOpen
      "
    >
      <legend>Revisão e publicação externa</legend>
      <label
        >Revisar esta skill externa até<input
          v-model="reviewDate"
          type="datetime-local"
          required /></label
      ><button :disabled="!tests?.requiredApproved || !reviewDate" @click="review">
        Revisar publicação externa
      </button>
      <div v-if="preview">
        <PublicationReview :preview="preview" />
        <p>
          Prévia válida até {{ new Date(preview.expiresAt).toLocaleString() }} · revisão até
          {{ new Date(preview.reviewDueAt).toLocaleString() }}
        </p>
        <p v-for="warning in preview.warnings" :key="warning">{{ warning }}</p>
        <label
          ><input v-model="confirmed" type="checkbox" />Revisei destino, entrada, saída, efeitos,
          conciliação e aprovação do contrato externo.</label
        ><button :disabled="!confirmed" @click="publish">Confirmar publicação externa</button>
      </div>
    </fieldset>
  </section>
</template>
