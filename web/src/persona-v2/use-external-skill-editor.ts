import { computed, onBeforeUnmount, ref, shallowRef, watch, type ComputedRef, type Ref } from "vue";
import type {
  ExternalImportCandidate,
  ExternalImportResult,
} from "../../../src/domain/persona-v2/external-import";
import type { IntegrationReference } from "../../../src/domain/persona-v2/integration-credential";
import type {
  ExternalDraftSummary,
  ExternalPublicationPreview,
  ExternalTestDetails,
} from "../../../src/domain/persona-v2/external-run";
import {
  emptyExternalContract,
  externalDraftStale,
  externalTestsRevisionChanged,
} from "./external-editor";
import { matchesSearch } from "./list-search";
import type { SkillEditorEmit } from "./skill-editor";
import { useEditorErrors } from "./useEditorErrors";
import { useExternalSkillDraft } from "./use-external-skill-draft";
import { useSkillPublication } from "./use-skill-publication";

export interface ExternalSkillEditorProps {
  api: <T>(url: string, body?: unknown) => Promise<T>;
  base: string;
  disabled: boolean;
  confirmDiscard: () => Promise<boolean>;
}

export interface ExternalSkillEditorState {
  search: Ref<string>;
  matchingDrafts: ComputedRef<ExternalDraftSummary[]>;
  drafts: Ref<readonly ExternalDraftSummary[]>;
  connections: Ref<readonly (IntegrationReference & { active: boolean })[]>;
  selected: Ref<string>;
  name: Ref<string>;
  slug: Ref<string>;
  contract: ReturnType<typeof useExternalSkillDraft>["contract"];
  busy: Ref<boolean>;
  caseBusy: Ref<boolean>;
  caseDirty: Ref<boolean>;
  caseKey: Ref<number>;
  fieldsKey: Ref<number>;
  message: Ref<string>;
  published: Ref<boolean>;
  staleContract: Ref<boolean>;
  active: ReturnType<typeof useExternalSkillDraft>["active"];
  pending: Record<string, boolean>;
  tests: Ref<ExternalTestDetails | undefined>;
  reviewDate: Ref<string>;
  confirmed: Ref<boolean>;
  preview: Ref<ExternalPublicationPreview | undefined>;
  advanced: Ref<string>;
  advancedOpen: Ref<boolean>;
  importDirty: Ref<boolean>;
  importPanel: Ref<{ clear: () => void } | null>;
  draftDirty: ComputedRef<boolean>;
  pendingFields: ComputedRef<boolean>;
  error: Ref<string>;
  errorSummary: Ref<HTMLElement | undefined>;
  editorRoot: Ref<HTMLElement | undefined>;
  errorId: string;
  invalid: (field: string) => boolean;
  select: (event: Event) => Promise<void>;
  refresh: () => Promise<void>;
  save: () => Promise<void>;
  copy: () => Promise<void>;
  applyImport: (
    candidate: ExternalImportCandidate,
    connection: ExternalImportResult["connection"],
  ) => Promise<void>;
  caseLock: (value: boolean) => void;
  caseUpdated: (value: ExternalTestDetails) => void;
  review: () => Promise<void>;
  publish: () => Promise<void>;
  applyAdvanced: () => void;
}

export function useExternalSkillEditor(
  props: ExternalSkillEditorProps,
  emit: SkillEditorEmit,
): ExternalSkillEditorState {
  const search = ref("");
  const drafts = ref<readonly ExternalDraftSummary[]>([]);
  const matchingDrafts = computed(() =>
    drafts.value.filter((draft) => matchesSearch(search.value, draft.name)),
  );
  const connections = ref<readonly (IntegrationReference & { active: boolean })[]>([]);
  const busy = ref(false);
  const caseBusy = ref(false);
  const caseDirty = ref(false);
  const caseKey = ref(0);
  const message = ref("");
  const tests = shallowRef<ExternalTestDetails>();
  const importDirty = ref(false);
  const { error, errorSummary, root: editorRoot, errorId, capture, invalid } = useEditorErrors();
  let live = true;
  let initialized = false;
  const root = computed(() => `${props.base}/integracoes/skills`);
  function isLive(): boolean {
    return live;
  }
  async function run(fn: () => Promise<void>): Promise<void> {
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
  let resetPublication = (): void => undefined;
  async function loadList(): Promise<void> {
    const [skills, integrations] = await Promise.all([
      props.api<{ skills: readonly ExternalDraftSummary[] }>(root.value),
      props.api<{ connections: typeof connections.value }>(`${props.base}/integracoes/conexoes`),
    ]);
    if (live) {
      drafts.value = skills.skills;
      connections.value = integrations.connections;
    }
  }
  const draft = useExternalSkillDraft({
    api: props.api,
    run,
    isLive,
    root,
    message,
    error,
    loadList,
    onChanged: () => emit("changed"),
    onResetDependents: () => {
      tests.value = undefined;
      caseDirty.value = false;
      caseKey.value++;
      resetPublication();
    },
    caseBlocked: () => caseDirty.value,
    blocked: () => busy.value || caseBusy.value || props.disabled,
  });
  const publication = useSkillPublication<ExternalPublicationPreview>({
    api: props.api,
    run,
    isLive,
    previewUrl: () => `${root.value}/${draft.selected.value}/preview`,
    publishUrl: () => `${root.value}/${draft.selected.value}/publicar`,
    canReview: () =>
      !draft.draftDirty.value &&
      !draft.pendingFields.value &&
      !caseDirty.value &&
      !draft.advancedOpen.value &&
      !draft.published.value,
    canPublish: () =>
      !draft.draftDirty.value &&
      !draft.pendingFields.value &&
      !caseDirty.value &&
      !draft.advancedOpen.value &&
      !draft.published.value,
    onPublished: async () => {
      await loadList();
      await draft.load(draft.selected.value);
    },
    publishedMessage:
      "Skill externa publicada. Conceda skill, operação e capacidade exatas aos tokens. Publicação não envia nem aprova ações.",
    message,
    onChanged: () => emit("changed"),
  });
  resetPublication = publication.reset;
  const dirty = computed(
    () =>
      draft.draftDirty.value ||
      importDirty.value ||
      draft.pendingFields.value ||
      caseDirty.value ||
      publication.dirty.value ||
      (draft.advancedOpen.value &&
        draft.advanced.value !== JSON.stringify(draft.contract.value, null, 2)),
  );
  watch(dirty, (value) => emit("dirty", value), { immediate: true });
  watch([draft.fingerprint, draft.pendingFields], () => publication.clearPreview());
  onBeforeUnmount(() => {
    live = false;
    draft.contract.value = emptyExternalContract();
    tests.value = undefined;
    publication.clearPreview();
    emit("dirty", false);
    emit("lock", false);
  });
  async function select(event: Event): Promise<void> {
    const element = event.target as HTMLSelectElement;
    const next = element.value;
    element.value = draft.selected.value;
    if (dirty.value && !(await props.confirmDiscard())) {
      return;
    }
    await run(() => draft.load(next));
  }
  async function refresh(): Promise<void> {
    if (dirty.value && !(await props.confirmDiscard())) {
      return;
    }
    await run(async () => {
      await loadList();
      await draft.load(draft.selected.value);
    });
  }
  async function copy(): Promise<void> {
    if (dirty.value && !(await props.confirmDiscard())) {
      return;
    }
    draft.copy();
  }
  async function applyImport(
    candidate: ExternalImportCandidate,
    connection: ExternalImportResult["connection"],
  ): Promise<void> {
    if (!candidate.proposal || busy.value || caseBusy.value || props.disabled) {
      return;
    }
    if (
      (draft.draftDirty.value ||
        draft.pendingFields.value ||
        caseDirty.value ||
        draft.advancedOpen.value ||
        publication.reviewDate.value) &&
      !(await props.confirmDiscard())
    ) {
      return;
    }
    await draft.applyImport(candidate, connection);
  }
  function caseLock(value: boolean): void {
    if (live) {
      caseBusy.value = value;
      emit("lock", value);
    }
  }
  function caseUpdated(value: ExternalTestDetails): void {
    if (!live) {
      return;
    }
    if (externalDraftStale(value, draft.contract.value, draft.name.value)) {
      draft.staleContract.value = true;
      tests.value = undefined;
      publication.clearPreview();
      error.value =
        "Contrato mudou em outra sessão. Preserve sua edição e recarregue a skill antes de continuar.";
      return;
    }
    if (tests.value && externalTestsRevisionChanged(tests.value, value)) {
      publication.clearPreview();
    }
    tests.value = value;
    draft.revision.value = value.revision;
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
  return {
    search,
    matchingDrafts,
    drafts,
    connections,
    selected: draft.selected,
    name: draft.name,
    slug: draft.slug,
    contract: draft.contract,
    busy,
    caseBusy,
    caseDirty,
    caseKey,
    fieldsKey: draft.fieldsKey,
    message,
    published: draft.published,
    staleContract: draft.staleContract,
    active: draft.active,
    pending: draft.pending,
    tests,
    reviewDate: publication.reviewDate,
    confirmed: publication.confirmed,
    preview: publication.preview,
    advanced: draft.advanced,
    advancedOpen: draft.advancedOpen,
    importDirty,
    importPanel: draft.importPanel,
    draftDirty: draft.draftDirty,
    pendingFields: draft.pendingFields,
    error,
    errorSummary,
    editorRoot,
    errorId,
    invalid,
    select,
    refresh,
    save: draft.save,
    copy,
    applyImport,
    caseLock,
    caseUpdated,
    review: publication.review,
    publish: publication.publish,
    applyAdvanced: draft.applyAdvanced,
  };
}
