import { computed, onBeforeUnmount, ref, watch, type ComputedRef, type Ref } from "vue";
import type {
  SkillDraft,
  PublicationPreviewResult,
  OperationTestDetails,
  CatalogPublication,
  PublishedPackage,
} from "../../../src/domain/persona-v2/catalog";
import type { FederationTraining } from "../../../src/domain/persona-v2/federation-training";
import type { Source } from "./model";
import {
  emptyFederation,
  federationPublicationCandidate,
  type QueryDependency,
} from "./federation-editor";
import { matchesSearch } from "./list-search";
import type { SkillEditorEmit } from "./skill-editor";
import { useEditorErrors } from "./useEditorErrors";
import { useFederationSkillDraft } from "./use-federation-skill-draft";
import { useSkillCases } from "./use-skill-cases";
import { useSkillPublication } from "./use-skill-publication";

export interface FederationSkillEditorProps {
  api: <T>(url: string, body?: unknown) => Promise<T>;
  base: string;
  sources: Source[];
  disabled: boolean;
  confirmDiscard: () => Promise<boolean>;
}

export interface FederationSkillEditorState {
  search: Ref<string>;
  matchingDrafts: ComputedRef<SkillDraft[]>;
  drafts: Ref<SkillDraft[]>;
  publications: Ref<QueryDependency[]>;
  selected: Ref<string>;
  revision: Ref<number>;
  name: Ref<string>;
  slug: Ref<string>;
  training: Ref<FederationTraining>;
  busy: Ref<boolean>;
  message: Ref<string>;
  caseDirty: Ref<boolean>;
  caseKey: Ref<number>;
  reviewDate: Ref<string>;
  confirmed: Ref<boolean>;
  tests: Ref<OperationTestDetails | undefined>;
  preview: Ref<PublicationPreviewResult | undefined>;
  active: Ref<CatalogPublication<PublishedPackage> | null>;
  advanced: Ref<string>;
  advancedOpen: Ref<boolean>;
  draftDirty: ComputedRef<boolean>;
  error: Ref<string>;
  errorSummary: Ref<HTMLElement | undefined>;
  editorRoot: Ref<HTMLElement | undefined>;
  errorId: string;
  invalid: (field: string) => boolean;
  select: (event: Event) => Promise<void>;
  refresh: () => Promise<void>;
  save: () => Promise<void>;
  saveCase: (payload: {
    id?: string;
    remove: boolean;
    required: boolean;
    content: unknown;
  }) => Promise<void>;
  review: () => Promise<void>;
  publish: () => Promise<void>;
  moreReports: () => Promise<void>;
  applyAdvanced: () => void;
}

export function useFederationSkillEditor(
  props: FederationSkillEditorProps,
  emit: SkillEditorEmit,
): FederationSkillEditorState {
  const search = ref("");
  const drafts = ref<SkillDraft[]>([]);
  const matchingDrafts = computed(() =>
    drafts.value.filter((item) => matchesSearch(search.value, item.name)),
  );
  const publications = ref<QueryDependency[]>([]);
  const busy = ref(false);
  const message = ref("");
  const { error, errorSummary, root: editorRoot, errorId, capture, invalid } = useEditorErrors();
  let live = true;
  let initialized = false;
  const root = computed(() => `${props.base}/skills`);
  function isLive(): boolean {
    return live;
  }
  async function run(fn: () => Promise<void>): Promise<void> {
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
  async function loadList(): Promise<void> {
    const result = await props.api<{ skills: SkillDraft[] }>(root.value);
    if (!live) {
      return;
    }
    drafts.value = result.skills.filter((skill) => skill.kind === "cruzamento");
    const candidates = await Promise.all(
      result.skills
        .filter((skill) => skill.kind === "consulta" && skill.activePublicationId)
        .map(async (skill) => {
          const { publication } = await props.api<{
            publication: CatalogPublication<PublishedPackage> | null;
          }>(`${root.value}/${skill.id}/publicacao`);
          return federationPublicationCandidate(publication, props.sources);
        }),
    );
    if (live) {
      publications.value = candidates.filter((item) => item !== null);
    }
  }
  let loadTests: () => Promise<void> = () => Promise.resolve();
  let resetDependents = (): void => undefined;
  let caseBlocked = (): boolean => false;
  let clearPreview = (): void => undefined;
  const draft = useFederationSkillDraft({
    api: props.api,
    run,
    isLive,
    root,
    drafts,
    message,
    error,
    loadList,
    loadTests: () => loadTests(),
    onChanged: () => emit("changed"),
    onResetDependents: () => resetDependents(),
    caseBlocked: () => caseBlocked(),
  });
  const cases = useSkillCases({
    api: props.api,
    run,
    isLive,
    testsUrl: () => `${root.value}/${draft.selected.value}/testes-cruzamento`,
    casesUrl: () => `${root.value}/${draft.selected.value}/casos-cruzamento`,
    revision: draft.revision,
    selected: draft.selected,
    message,
    savedMessage: "Caso de cruzamento salvo. Solicite uma rodada atual ao operador.",
    loadList,
    onSaved: () => clearPreview(),
  });
  loadTests = cases.loadTests;
  caseBlocked = () => cases.caseDirty.value;
  const publication = useSkillPublication<
    PublicationPreviewResult,
    { publication: CatalogPublication<PublishedPackage> }
  >({
    api: props.api,
    run,
    isLive,
    previewUrl: () => `${root.value}/${draft.selected.value}/preview`,
    publishUrl: () => `${root.value}/${draft.selected.value}/publicar`,
    canReview: () => !draft.draftDirty.value && !cases.caseDirty.value && !draft.advancedOpen.value,
    canPublish: () =>
      !draft.draftDirty.value && !cases.caseDirty.value && !draft.advancedOpen.value,
    onPublished: async (result) => {
      draft.active.value = result.publication;
      await loadList();
    },
    publishedMessage:
      "Cruzamento publicado. Conceda o cruzamento e cada consulta e base dependente explicitamente aos tokens.",
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
      publication.dirty.value ||
      (draft.advancedOpen.value &&
        draft.advanced.value !== JSON.stringify(draft.training.value, null, 2)),
  );
  watch(dirty, (value) => emit("dirty", value), { immediate: true });
  watch(draft.fingerprint, () => publication.clearPreview());
  onBeforeUnmount(() => {
    live = false;
    draft.training.value = emptyFederation();
    cases.reset();
    publication.clearPreview();
    emit("dirty", false);
    emit("lock", false);
  });
  async function select(event: Event): Promise<void> {
    const element = event.target as HTMLSelectElement;
    const id = element.value;
    element.value = draft.selected.value;
    if (dirty.value && !(await props.confirmDiscard())) {
      return;
    }
    await run(() => draft.load(id));
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
    publications,
    selected: draft.selected,
    revision: draft.revision,
    name: draft.name,
    slug: draft.slug,
    training: draft.training,
    busy,
    message,
    caseDirty: cases.caseDirty,
    caseKey: cases.caseKey,
    reviewDate: publication.reviewDate,
    confirmed: publication.confirmed,
    tests: cases.tests,
    preview: publication.preview,
    active: draft.active,
    advanced: draft.advanced,
    advancedOpen: draft.advancedOpen,
    draftDirty: draft.draftDirty,
    error,
    errorSummary,
    editorRoot,
    errorId,
    invalid,
    select,
    refresh,
    save: draft.save,
    saveCase: cases.saveCase,
    review: publication.review,
    publish: publication.publish,
    moreReports: cases.moreReports,
    applyAdvanced: draft.applyAdvanced,
  };
}
