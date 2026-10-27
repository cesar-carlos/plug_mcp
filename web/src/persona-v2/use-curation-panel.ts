import { computed, onBeforeUnmount, ref, watch, type ComputedRef, type Ref } from "vue";
import type { ProfilePublication } from "./knowledge-model";
import type { Content } from "./knowledge-model";
import { useErrorSummary } from "./useErrorSummary";
import type { CurationExample, CurationProposal, CurationProposalKind } from "./curation-proposal";
import { useCurationProposal } from "./use-curation-proposal";
import { useCurationReview, type CurationPreview } from "./use-curation-review";

export interface CurationPanelProps {
  catalogId: string;
  role: string;
  patterns: { id: string; name: string; activePublicationId: string | null }[];
  api: <T>(url: string, body?: unknown) => Promise<T>;
  disabled: boolean;
  draftDirty: boolean;
  confirmDiscard: () => Promise<boolean>;
  physical?: { sourceBase: string; publication: ProfilePublication };
}

export interface CurationPanelEmit {
  (event: "dirty", value: boolean): void;
  (event: "lock", value: boolean): void;
  (event: "updated", resourceId: string): void;
}

export type { CurationPreview };

export interface CurationPanelState {
  proposals: Ref<CurationProposal[]>;
  nextCursor: Ref<string | null>;
  selected: Ref<CurationProposal | undefined>;
  baseId: Ref<string>;
  summary: Ref<string>;
  kind: Ref<CurationProposalKind>;
  rule: Ref<string>;
  example: Ref<CurationExample>;
  proposalContent: Ref<Content | undefined>;
  loadedBaseId: Ref<string>;
  targetId: Ref<string>;
  overrideCommon: Ref<boolean>;
  reason: Ref<string>;
  confirmed: Ref<boolean>;
  message: Ref<string>;
  error: Ref<string>;
  errorSummary: Ref<HTMLElement | undefined>;
  preview: Ref<CurationPreview | undefined>;
  busy: Ref<boolean>;
  mayReview: ComputedRef<boolean>;
  bases: ComputedRef<{ id: string; name: string; activePublicationId: string | null }[]>;
  structuralItems: ComputedRef<Content["tables"] | Content["relationships"]>;
  run: (action: () => Promise<void>) => Promise<void>;
  refresh: (append?: boolean) => Promise<void>;
  propose: () => Promise<void>;
  loadStructure: () => Promise<void>;
  select: (proposal: CurationProposal) => Promise<void>;
  review: () => Promise<void>;
  decide: (action: "incorporar" | "rejeitar") => Promise<void>;
}

export function useCurationPanel(
  props: CurationPanelProps,
  emit: CurationPanelEmit,
): CurationPanelState {
  const proposals = ref<CurationProposal[]>([]);
  const nextCursor = ref<string | null>(null);
  const busy = ref(false);
  const message = ref("");
  const { error, errorSummary } = useErrorSummary();
  const physicalMayReview = ref(false);
  const mayReview = computed(() =>
    props.physical ? physicalMayReview.value : ["administrator", "curator"].includes(props.role),
  );
  const bases = computed(() =>
    props.physical
      ? [
          {
            id: props.physical.publication.id,
            name: `${props.physical.publication.name} · revisão ${props.physical.publication.revision}`,
            activePublicationId: props.physical.publication.publicationId,
          },
        ]
      : props.patterns,
  );
  let live = true;
  function isLive(): boolean {
    return live;
  }
  function root(): string {
    return props.physical
      ? `${props.physical.sourceBase}/perfis/curadoria/${props.catalogId}/${props.physical.publication.publicationId}/propostas`
      : `/api/admin/catalogos/${props.catalogId}/propostas`;
  }
  async function run(action: () => Promise<void>): Promise<void> {
    if (busy.value || props.disabled) {
      return;
    }
    busy.value = true;
    emit("lock", true);
    error.value = "";
    message.value = "";
    try {
      await action();
    } catch (cause) {
      if (live) {
        error.value =
          cause instanceof Error ? cause.message : "Não foi possível concluir a curadoria.";
      }
    } finally {
      if (live) {
        busy.value = false;
      }
      emit("lock", false);
    }
  }
  async function refresh(append = false): Promise<void> {
    const data = await props.api<{
      proposals: CurationProposal[];
      nextCursor: string | null;
      mayReview?: boolean;
    }>(
      `${root()}${append && nextCursor.value ? `?beforeId=${encodeURIComponent(nextCursor.value)}` : ""}`,
    );
    if (!live) {
      return;
    }
    proposals.value = append ? [...proposals.value, ...data.proposals] : data.proposals;
    nextCursor.value = data.nextCursor;
    physicalMayReview.value = data.mayReview === true;
  }
  const proposal = useCurationProposal({
    catalogId: props.catalogId,
    physical: props.physical,
    api: props.api,
    run,
    isLive,
    disabled: () => props.disabled,
    busy,
    confirmDiscard: () => props.confirmDiscard(),
    root,
    refresh,
    message,
  });
  const reviewState = useCurationReview({
    physical: props.physical,
    api: props.api,
    run,
    isLive,
    draftDirty: () => props.draftDirty,
    confirmDiscard: () => props.confirmDiscard(),
    root,
    refresh,
    message,
    error,
    emitUpdated: (resourceId) => emit("updated", resourceId),
  });
  const dirty = computed(() => proposal.dirty.value || reviewState.dirty.value);
  watch(dirty, (value) => emit("dirty", value), { immediate: true });
  onBeforeUnmount(() => {
    live = false;
    emit("dirty", false);
  });
  void run(() => refresh());
  return {
    proposals,
    nextCursor,
    selected: reviewState.selected,
    baseId: proposal.baseId,
    summary: proposal.summary,
    kind: proposal.kind,
    rule: proposal.rule,
    example: proposal.example,
    proposalContent: proposal.proposalContent,
    loadedBaseId: proposal.loadedBaseId,
    targetId: proposal.targetId,
    overrideCommon: proposal.overrideCommon,
    reason: reviewState.reason,
    confirmed: reviewState.confirmed,
    message,
    error,
    errorSummary,
    preview: reviewState.preview,
    busy,
    mayReview,
    bases,
    structuralItems: proposal.structuralItems,
    run,
    refresh,
    propose: proposal.propose,
    loadStructure: proposal.loadStructure,
    select: reviewState.select,
    review: reviewState.review,
    decide: reviewState.decide,
  };
}
