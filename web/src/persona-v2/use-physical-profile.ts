import { computed, nextTick, onBeforeUnmount, ref, watch, type ComputedRef, type Ref } from "vue";
import { z } from "zod";
import {
  physicalProfilePublicationSchema,
  physicalProfileSchema,
} from "../../../src/domain/persona-v2/physical-profile";
import type { Inspection, KnowledgeSelection, Profile, ProfilePage } from "./knowledge-model";
import type { Dialect } from "./model";
import { publicationDeadline } from "./publication-deadline";
import {
  copyPhysicalOverrides,
  emptyPhysicalOverrides,
  physicalProfileContentExceedsLimit,
  physicalProfileDirty,
  physicalProfileErrorMessage,
  physicalProfileExpiredMessage,
  physicalProfileFingerprint,
  physicalProfileInitialContent,
  physicalProfilePreviewExpired,
  physicalProfilePublishedMessage,
  physicalProfileReportsDirty,
  physicalProfileSavedMessage,
  physicalProfileSuspendedMessage,
  physicalProfileSwitchNeedsDiscard,
  type PhysicalProfileOverrides,
  type PhysicalProfilePreview,
} from "./physical-profile-editor";
import { useErrorSummary } from "./useErrorSummary";

export interface PhysicalProfileEditorProps {
  selection: KnowledgeSelection;
  page: ProfilePage;
  inspection?: Inspection;
  sourceBase: string;
  dialect: Dialect;
  api: <T>(url: string, body?: unknown) => Promise<T>;
  disabled: boolean;
  confirmDiscard: () => Promise<boolean>;
}

export interface PhysicalProfileEditorEmit {
  (event: "dirty", value: boolean): void;
  (event: "lock", value: boolean): void;
  (event: "saved"): void;
  (event: "moreDrafts"): void;
}

export interface PhysicalProfileEditorState {
  editing: Ref<boolean>;
  id: Ref<string>;
  revision: Ref<number>;
  name: Ref<string>;
  content: Ref<unknown>;
  overrides: Ref<PhysicalProfileOverrides>;
  reviewDate: Ref<string>;
  dirty: ComputedRef<boolean>;
  preview: Ref<PhysicalProfilePreview | undefined>;
  confirmed: Ref<boolean>;
  suspendConfirmed: Ref<boolean>;
  busy: Ref<boolean>;
  message: Ref<string>;
  error: Ref<string>;
  errorSummary: Ref<HTMLElement | undefined>;
  start: (draft?: Profile) => Promise<void>;
  save: () => Promise<void>;
  review: () => Promise<void>;
  publish: () => Promise<void>;
  suspend: () => Promise<void>;
}

export function usePhysicalProfile(
  props: PhysicalProfileEditorProps,
  emit: PhysicalProfileEditorEmit,
): PhysicalProfileEditorState {
  const editing = ref(false);
  const id = ref("");
  const revision = ref(0);
  const name = ref("");
  const content = ref<unknown>();
  const overrides = ref<PhysicalProfileOverrides>(emptyPhysicalOverrides());
  const fingerprint = computed(() =>
    physicalProfileFingerprint({
      name: name.value,
      content: content.value,
      overrides: overrides.value,
    }),
  );
  const saved = ref("");
  const reviewDate = ref("");
  const dirty = computed(() => physicalProfileDirty(editing.value, fingerprint.value, saved.value));
  const preview = ref<PhysicalProfilePreview>();
  const confirmed = ref(false);
  const suspendConfirmed = ref(false);
  const busy = ref(false);
  const message = ref("");
  const now = ref(Date.now());
  const { error, errorSummary } = useErrorSummary();
  let live = true;
  let refreshAfterSave = false;

  watch(
    () =>
      physicalProfileReportsDirty({
        dirty: dirty.value,
        suspendConfirmed: suspendConfirmed.value,
        reviewDate: reviewDate.value,
      }),
    (value) => emit("dirty", value),
    { immediate: true },
  );
  watch(fingerprint, () => {
    preview.value = undefined;
    confirmed.value = false;
  });
  watch(reviewDate, () => {
    preview.value = undefined;
    confirmed.value = false;
  });
  const timer = window.setInterval(() => {
    now.value = Date.now();
    if (preview.value && physicalProfilePreviewExpired(preview.value.expiresAt, now.value)) {
      preview.value = undefined;
      confirmed.value = false;
      message.value = physicalProfileExpiredMessage;
    }
  }, 1000);
  onBeforeUnmount(() => {
    live = false;
    window.clearInterval(timer);
    emit("dirty", false);
  });

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
        error.value = physicalProfileErrorMessage(cause, "Não foi possível concluir o perfil.");
      }
    } finally {
      if (live) {
        busy.value = false;
      }
      emit("lock", false);
      await nextTick();
      if (live && refreshAfterSave) {
        refreshAfterSave = false;
        emit("saved");
      }
    }
  }

  async function start(draft?: Profile): Promise<void> {
    if (
      physicalProfileSwitchNeedsDiscard(dirty.value, reviewDate.value) &&
      !(await props.confirmDiscard())
    ) {
      return;
    }
    reviewDate.value = "";
    editing.value = true;
    id.value = draft?.id ?? "";
    revision.value = draft?.revision ?? 0;
    name.value = draft?.name ?? "";
    content.value = physicalProfileInitialContent(
      draft,
      props.selection.profile?.content,
      props.selection.standard.content,
    );
    overrides.value = draft ? copyPhysicalOverrides(draft.overrides) : emptyPhysicalOverrides();
    preview.value = undefined;
    confirmed.value = false;
    saved.value = draft ? fingerprint.value : "";
  }

  async function save(): Promise<void> {
    await run(async () => {
      if (physicalProfileContentExceedsLimit(content.value)) {
        throw new Error("O perfil excede o limite de 50 KiB. Reduza o conteúdo antes de salvar.");
      }
      const raw = await props.api<unknown>(`${props.sourceBase}/perfis/salvar`, {
        catalogId: props.selection.catalogId,
        basePublicationId: props.selection.standard.id,
        name: name.value,
        content: content.value,
        overrides: overrides.value,
        ...(id.value ? { id: id.value, expectedRevision: revision.value } : {}),
      });
      const data = z.object({ profile: physicalProfileSchema }).parse(raw);
      if (!live) {
        return;
      }
      id.value = data.profile.id;
      revision.value = data.profile.revision;
      saved.value = fingerprint.value;
      preview.value = undefined;
      message.value = physicalProfileSavedMessage;
      refreshAfterSave = true;
    });
  }

  async function review(): Promise<void> {
    await run(async () => {
      if (!props.inspection) {
        throw new Error("Inspecione a estrutura da base antes de revisar.");
      }
      const data = z
        .object({
          profile: physicalProfileSchema,
          hash: z.string(),
          confirmationHash: z.string(),
          expiresAt: z.iso.datetime({ offset: true }),
          reviewDueAt: z.iso.datetime(),
        })
        .parse(
          await props.api<unknown>(`${props.sourceBase}/perfis/preview`, {
            catalogId: props.selection.catalogId,
            profileId: id.value,
            evidenceId: props.inspection.id,
            reviewDueAt: publicationDeadline(reviewDate.value),
          }),
        );
      if (live) {
        preview.value = data;
        confirmed.value = false;
      }
    });
  }

  async function publish(): Promise<void> {
    if (!preview.value || !confirmed.value) {
      return;
    }
    const current = preview.value;
    await run(async () => {
      if (!props.inspection) {
        throw new Error("A evidência não está mais disponível. Inspecione novamente.");
      }
      physicalProfilePublicationSchema.parse(
        await props.api<unknown>(`${props.sourceBase}/perfis/publicar`, {
          catalogId: props.selection.catalogId,
          profileId: id.value,
          evidenceId: props.inspection.id,
          confirmationHash: current.confirmationHash,
        }),
      );
      if (!live) {
        return;
      }
      preview.value = undefined;
      confirmed.value = false;
      message.value = physicalProfilePublishedMessage;
      reviewDate.value = "";
      refreshAfterSave = true;
    });
  }

  async function suspend(): Promise<void> {
    if (!props.selection.profile || !suspendConfirmed.value) {
      return;
    }
    await run(async () => {
      await props.api(`${props.sourceBase}/perfis/suspender`, {
        catalogId: props.selection.catalogId,
        publicationId: props.selection.profile!.publicationId,
      });
      if (!live) {
        return;
      }
      suspendConfirmed.value = false;
      message.value = physicalProfileSuspendedMessage;
      refreshAfterSave = true;
    });
  }

  watch(
    () => props.inspection?.id,
    () => {
      preview.value = undefined;
      confirmed.value = false;
    },
  );

  return {
    editing,
    id,
    revision,
    name,
    content,
    overrides,
    reviewDate,
    dirty,
    preview,
    confirmed,
    suspendConfirmed,
    busy,
    message,
    error,
    errorSummary,
    start,
    save,
    review,
    publish,
    suspend,
  };
}
