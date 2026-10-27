import {
  computed,
  reactive,
  ref,
  shallowRef,
  type ComputedRef,
  type Ref,
  type ShallowRef,
} from "vue";
import {
  externalContractSchema,
  type ExternalContract,
} from "../../../src/domain/persona-v2/external-contract";
import type {
  ExternalImportCandidate,
  ExternalImportResult,
} from "../../../src/domain/persona-v2/external-import";
import type { ExternalDraftDetails } from "../../../src/domain/persona-v2/external-run";
import {
  editableExternalContract,
  emptyExternalContract,
  importedExternalContract,
  newExternalContractFrom,
} from "./external-editor";

export function useExternalSkillDraft(input: {
  api: <T>(url: string, body?: unknown) => Promise<T>;
  run: (action: () => Promise<void>) => Promise<void>;
  isLive: () => boolean;
  root: ComputedRef<string>;
  message: Ref<string>;
  error: Ref<string>;
  loadList: () => Promise<void>;
  onChanged: () => void;
  onResetDependents: () => void;
  caseBlocked: () => boolean;
  blocked: () => boolean;
}): {
  selected: Ref<string>;
  name: Ref<string>;
  slug: Ref<string>;
  revision: Ref<number>;
  contract: ShallowRef<ExternalContract>;
  published: Ref<boolean>;
  staleContract: Ref<boolean>;
  active: ShallowRef<ExternalDraftDetails["publication"]>;
  pending: Record<string, boolean>;
  fieldsKey: Ref<number>;
  advanced: Ref<string>;
  advancedOpen: Ref<boolean>;
  importPanel: Ref<{ clear: () => void } | null>;
  importConnection: Ref<ExternalImportResult["connection"] | undefined>;
  fingerprint: ComputedRef<string>;
  draftDirty: ComputedRef<boolean>;
  pendingFields: ComputedRef<boolean>;
  load: (id: string) => Promise<void>;
  save: () => Promise<void>;
  copy: () => void;
  applyImport: (
    candidate: ExternalImportCandidate,
    connection: ExternalImportResult["connection"],
  ) => Promise<boolean>;
  applyAdvanced: () => void;
  clearPending: () => void;
} {
  const selected = ref("");
  const name = ref("");
  const slug = ref("");
  const revision = ref(0);
  const contract = shallowRef<ExternalContract>(editableExternalContract(emptyExternalContract()));
  const saved = ref("");
  const published = ref(false);
  const staleContract = ref(false);
  const active = shallowRef<ExternalDraftDetails["publication"]>(null);
  const pending = reactive<Record<string, boolean>>({});
  const fieldsKey = ref(0);
  const advanced = ref("");
  const advancedOpen = ref(false);
  const importPanel = ref<{ clear: () => void } | null>(null);
  const importConnection = ref<ExternalImportResult["connection"]>();
  const fingerprint = computed(() =>
    JSON.stringify({
      name: name.value,
      slug: slug.value,
      contract: contract.value,
      importConnection: importConnection.value,
    }),
  );
  saved.value = fingerprint.value;
  const draftDirty = computed(() => fingerprint.value !== saved.value);
  const pendingFields = computed(() => Object.values(pending).some(Boolean));
  function clearPending(): void {
    for (const key of Object.keys(pending)) {
      delete pending[key];
    }
    fieldsKey.value++;
  }
  async function load(id: string): Promise<void> {
    const draft = id
      ? await input.api<ExternalDraftDetails>(`${input.root.value}/${id}/rascunho`)
      : undefined;
    if (!input.isLive()) {
      return;
    }
    selected.value = id;
    importConnection.value = undefined;
    name.value = draft?.name ?? "";
    slug.value = draft?.slug ?? "";
    revision.value = draft?.revision ?? 0;
    contract.value = editableExternalContract(
      draft
        ? (JSON.parse(JSON.stringify(draft.contract)) as ExternalContract)
        : emptyExternalContract(),
    );
    published.value = draft?.published ?? false;
    active.value = draft?.publication ?? null;
    saved.value = fingerprint.value;
    staleContract.value = false;
    clearPending();
    advancedOpen.value = false;
    input.onResetDependents();
  }
  async function save(): Promise<void> {
    if (
      published.value ||
      staleContract.value ||
      pendingFields.value ||
      input.caseBlocked() ||
      advancedOpen.value
    ) {
      return;
    }
    await input.run(async () => {
      const parsed = externalContractSchema.safeParse(contract.value);
      if (!parsed.success) {
        throw new Error(
          "Revise integração, transporte, campos, efeitos e conciliação. O contrato deve corresponder exatamente ao serviço remoto.",
        );
      }
      if (selected.value) {
        await input.api(`${input.root.value}/${selected.value}/rascunho`, {
          expectedRevision: revision.value,
          name: name.value,
          contract: parsed.data,
        });
      } else {
        const result = await input.api<{ skillId: string; operationId: string }>(input.root.value, {
          name: name.value,
          slug: slug.value,
          contract: parsed.data,
          ...(importConnection.value ? { expectedConnection: importConnection.value } : {}),
        });
        if (!input.isLive()) {
          return;
        }
        selected.value = result.skillId;
      }
      await input.loadList();
      await load(selected.value);
      if (input.isLive()) {
        input.onChanged();
        input.message.value =
          "Rascunho externo salvo. Execute casos em fixture isolada antes da revisão. Nenhuma chamada externa foi enviada.";
      }
    });
  }
  function copy(): void {
    if (!input.isLive() || input.blocked()) {
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
    advancedOpen.value = false;
    input.onResetDependents();
    input.message.value =
      "Escolha novo identificador e revise o contrato. A nova skill receberá outra operação, sem casos, relatórios ou concessões herdados.";
  }
  async function applyImport(
    candidate: ExternalImportCandidate,
    connection: ExternalImportResult["connection"],
  ): Promise<boolean> {
    if (!candidate.proposal || input.blocked()) {
      return false;
    }
    if (!input.isLive()) {
      return false;
    }
    await load("");
    if (!input.isLive()) {
      return false;
    }
    name.value = candidate.name;
    importConnection.value = connection;
    contract.value = editableExternalContract(
      importedExternalContract(candidate.proposal, connection.id),
    );
    importPanel.value?.clear();
    input.message.value =
      "Proposta aplicada somente ao formulário. Revise finalidade, campos, classificação, efeitos e conciliação antes de salvar o rascunho. Não há publicação ou concessões herdadas.";
    return true;
  }
  function applyAdvanced(): void {
    try {
      const parsed = externalContractSchema.parse(JSON.parse(advanced.value));
      if (parsed.operationId !== contract.value.operationId) {
        throw new Error("identity");
      }
      contract.value = editableExternalContract(parsed);
      advancedOpen.value = false;
      clearPending();
    } catch {
      input.error.value =
        "JSON inválido ou identidade alterada. Preserve a operação atribuída pelo servidor e o contrato estrito.";
    }
  }
  return {
    selected,
    name,
    slug,
    revision,
    contract,
    published,
    staleContract,
    active,
    pending,
    fieldsKey,
    advanced,
    advancedOpen,
    importPanel,
    importConnection,
    fingerprint,
    draftDirty,
    pendingFields,
    load,
    save,
    copy,
    applyImport,
    applyAdvanced,
    clearPending,
  };
}
