import {
  computed,
  onBeforeUnmount,
  ref,
  watch,
  type ComputedRef,
  type Ref,
  type WritableComputedRef,
} from "vue";
import type {
  OperationTestDetails,
  PublicationPreviewResult,
  SkillDraft,
} from "../../../src/domain/persona-v2/catalog";
import type { Source } from "./model";
import { emptyOperation, type OperationTraining } from "./operation-editor";
import { matchesSearch } from "./list-search";
import type { SkillEditorEmit } from "./skill-editor";
import { useEditorErrors } from "./useEditorErrors";
import { useOperationSkillDraft, type OperationPublication } from "./use-operation-skill-draft";
import { useSkillCases } from "./use-skill-cases";
import { useSkillPublication } from "./use-skill-publication";

export interface OperationSkillEditorProps {
  api: <T>(url: string, body?: unknown) => Promise<T>;
  base: string;
  sources: Source[];
  disabled: boolean;
  confirmDiscard: () => Promise<boolean>;
}

export interface OperationSkillEditorState {
  search: Ref<string>;
  matchingDrafts: ComputedRef<SkillDraft[]>;
  drafts: Ref<SkillDraft[]>;
  selected: Ref<string>;
  revision: Ref<number>;
  name: Ref<string>;
  slug: Ref<string>;
  training: Ref<OperationTraining>;
  busy: Ref<boolean>;
  message: Ref<string>;
  tests: Ref<OperationTestDetails | undefined>;
  caseDirty: Ref<boolean>;
  caseKey: Ref<number>;
  reviewDate: Ref<string>;
  confirmed: Ref<boolean>;
  preview: Ref<PublicationPreviewResult | undefined>;
  active: Ref<OperationPublication | null>;
  advanced: Ref<string>;
  advancedOpen: Ref<boolean>;
  knowledgeDirty: Ref<boolean>;
  knowledgeKey: Ref<number>;
  knowledgeBusy: Ref<boolean>;
  relationships: WritableComputedRef<NonNullable<OperationTraining["relationships"]>>;
  draftDirty: ComputedRef<boolean>;
  error: Ref<string>;
  errorSummary: Ref<HTMLElement | undefined>;
  editorRoot: Ref<HTMLElement | undefined>;
  errorId: string;
  invalid: (field: string) => boolean;
  selectChanged: (event: Event) => void;
  refresh: () => Promise<void>;
  save: () => Promise<void>;
  saveCase: (payload: {
    id?: string;
    remove: boolean;
    required: boolean;
    content: unknown;
  }) => Promise<void>;
  sourceChange: (event: Event) => Promise<void>;
  knowledgeLock: (value: boolean) => void;
  adoptKnowledge: (value: OperationTraining) => void;
  review: () => Promise<void>;
  publish: () => Promise<void>;
  moreReports: () => Promise<void>;
  applyAdvanced: () => void;
}

export function useOperationSkillEditor(
  props: OperationSkillEditorProps,
  emit: SkillEditorEmit,
): OperationSkillEditorState {
  const search = ref("");
  const drafts = ref<SkillDraft[]>([]);
  const matchingDrafts = computed(() =>
    drafts.value.filter((item) => matchesSearch(search.value, item.name)),
  );
  const busy = ref(false);
  const message = ref("");
  const knowledgeDirty = ref(false);
  const knowledgeBusy = ref(false);
  const { error, errorSummary, root: editorRoot, errorId, capture, invalid } = useEditorErrors();
  let live = true;
  const root = computed(() => `${props.base}/skills`);
  function isLive(): boolean {
    return live;
  }
  async function run(fn: () => Promise<void>): Promise<void> {
    if (!live || busy.value || knowledgeBusy.value || props.disabled) {
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
  async function loadList(): Promise<void> {
    if (!live) {
      return;
    }
    const result = await props.api<{ skills: SkillDraft[] }>(root.value);
    if (live) {
      drafts.value = result.skills.filter((item) => item.kind === "operacao_sql");
    }
  }
  let loadTests: () => Promise<void> = () => Promise.resolve();
  let resetDependents = (): void => undefined;
  let caseBlocked = (): boolean => false;
  let clearPreview = (): void => undefined;
  const draft = useOperationSkillDraft({
    api: props.api,
    run,
    isLive,
    root,
    drafts,
    sources: () => props.sources,
    message,
    error,
    loadList,
    loadTests: () => loadTests(),
    onChanged: () => emit("changed"),
    onResetDependents: () => resetDependents(),
    caseBlocked: () => caseBlocked(),
    knowledgeDirty,
    knowledgeBusy,
    blocked: () => busy.value || knowledgeBusy.value || props.disabled,
    confirmDiscard: () => props.confirmDiscard(),
    clearPreview: () => clearPreview(),
  });
  const cases = useSkillCases({
    api: props.api,
    run,
    isLive,
    testsUrl: () => `${root.value}/${draft.selected.value}/testes-operacao`,
    casesUrl: () => `${root.value}/${draft.selected.value}/casos-operacao`,
    revision: draft.revision,
    selected: draft.selected,
    message,
    savedMessage: "Caso salvo. É necessária uma rodada técnica atual pelo runner isolado.",
    loadList,
    onSaved: () => clearPreview(),
  });
  loadTests = cases.loadTests;
  caseBlocked = () => cases.caseDirty.value;
  const publication = useSkillPublication<
    PublicationPreviewResult,
    { publication: OperationPublication }
  >({
    api: props.api,
    run,
    isLive,
    previewUrl: () => `${root.value}/${draft.selected.value}/preview`,
    publishUrl: () => `${root.value}/${draft.selected.value}/publicar`,
    canReview: () =>
      !draft.draftDirty.value &&
      !cases.caseDirty.value &&
      !knowledgeDirty.value &&
      !draft.advancedOpen.value,
    canPublish: () => !draft.draftDirty.value && !cases.caseDirty.value && !knowledgeDirty.value,
    onPublished: async (result) => {
      draft.active.value = result.publication;
      await loadList();
    },
    publishedMessage:
      "Skill de operação publicada. Conceda as capacidades explicitamente aos tokens. Nenhum lançamento foi executado.",
    message,
    onChanged: () => emit("changed"),
  });
  clearPreview = publication.clearPreview;
  resetDependents = (): void => {
    cases.reset();
    publication.reset();
  };
  const dirty = computed(
    () =>
      draft.draftDirty.value ||
      cases.caseDirty.value ||
      knowledgeDirty.value ||
      publication.dirty.value ||
      (draft.advancedOpen.value &&
        draft.advanced.value !== JSON.stringify(draft.training.value, null, 2)),
  );
  watch(dirty, (value) => emit("dirty", value), { immediate: true });
  watch(draft.fingerprint, () => publication.clearPreview());
  onBeforeUnmount(() => {
    live = false;
    draft.training.value = emptyOperation();
    cases.reset();
    publication.clearPreview();
    emit("dirty", false);
    emit("lock", false);
  });
  async function select(id: string): Promise<void> {
    if (dirty.value && !(await props.confirmDiscard())) {
      return;
    }
    await run(() => draft.load(id));
  }
  function selectChanged(event: Event): void {
    const element = event.target as HTMLSelectElement;
    const id = element.value;
    element.value = draft.selected.value;
    void select(id);
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
  function knowledgeLock(value: boolean): void {
    if (!live) {
      return;
    }
    knowledgeBusy.value = value;
    emit("lock", value);
  }
  let initialized = false;
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
    selected: draft.selected,
    revision: draft.revision,
    name: draft.name,
    slug: draft.slug,
    training: draft.training,
    busy,
    message,
    tests: cases.tests,
    caseDirty: cases.caseDirty,
    caseKey: cases.caseKey,
    reviewDate: publication.reviewDate,
    confirmed: publication.confirmed,
    preview: publication.preview,
    active: draft.active,
    advanced: draft.advanced,
    advancedOpen: draft.advancedOpen,
    knowledgeDirty,
    knowledgeKey: draft.knowledgeKey,
    knowledgeBusy,
    relationships: draft.relationships,
    draftDirty: draft.draftDirty,
    error,
    errorSummary,
    editorRoot,
    errorId,
    invalid,
    selectChanged,
    refresh,
    save: draft.save,
    saveCase: cases.saveCase,
    sourceChange: draft.sourceChange,
    knowledgeLock,
    adoptKnowledge: draft.adoptKnowledge,
    review: publication.review,
    publish: publication.publish,
    moreReports: cases.moreReports,
    applyAdvanced: draft.applyAdvanced,
  };
}
