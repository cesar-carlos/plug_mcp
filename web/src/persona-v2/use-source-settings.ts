import {
  computed,
  nextTick,
  onBeforeUnmount,
  reactive,
  ref,
  watch,
  type ComputedRef,
  type Ref,
} from "vue";
import type { Source, SourceRestriction } from "./model";
import type { SourcePublicationImpact } from "../../../src/domain/persona-v2/model";
import {
  clearSourceCredentials,
  draftSourceRestrictions,
  emptySourceCredentials,
  isSourceIdentityDirty,
  isSourceSettingsDirty,
  publishedSourceRestrictions,
  SOURCE_VERSION_CHANGED_MESSAGE,
  sourceImpactUrl,
  sourceSettingsSnapshot,
  type SourceCredentialDraft,
  type SourceRestrictionDraft,
  type SourceSettingsAction,
  type SourceSettingsIdentity,
} from "./source-settings";

export interface SourceSettingsProps {
  source: Source;
  busy: boolean;
  base: string;
  api: <T>(url: string, body?: unknown) => Promise<T>;
}

export interface SourceSettingsEmit {
  (
    event: "save",
    input: {
      expectedVersion: number;
      name: string;
      purpose: string;
      environment: string;
      rowRestrictions: SourceRestriction[];
    },
  ): void;
  (
    event: "rotate",
    input: { expectedVersion: number; email: string; password: string; clientToken: string },
  ): void;
  (event: "dirty", value: boolean): void;
  (event: "reload"): void;
  (event: "lock", value: boolean): void;
}

export interface SourceSettingsState {
  expectedVersion: number;
  form: Ref<SourceSettingsIdentity>;
  restrictions: Ref<SourceRestrictionDraft[]>;
  credentials: Ref<SourceCredentialDraft>;
  impact: Ref<SourcePublicationImpact | undefined>;
  pending: Ref<SourceSettingsAction | undefined>;
  confirmed: Ref<boolean>;
  error: Ref<string>;
  errorSummary: Ref<HTMLElement | undefined>;
  identityDirty: ComputedRef<boolean>;
  review: (action: SourceSettingsAction) => Promise<void>;
  confirmChange: () => void;
  continueEditing: () => void;
}

export function useSourceSettings(
  props: SourceSettingsProps,
  emit: SourceSettingsEmit,
): SourceSettingsState {
  const impact = ref<SourcePublicationImpact>();
  const pending = ref<SourceSettingsAction>();
  const confirmed = ref(false);
  const error = ref("");
  const errorSummary = ref<HTMLElement>();
  let live = true;
  onBeforeUnmount(() => {
    live = false;
  });
  // A background refresh cannot silently change the version of an unsaved form.
  const expectedVersion = props.source.authorizationVersion;
  const form = ref(
    reactive<SourceSettingsIdentity>({
      name: props.source.name,
      purpose: props.source.purpose,
      environment: props.source.environment,
    }),
  );
  const restrictions = ref(reactive(draftSourceRestrictions(props.source.rowRestrictions)));
  const credentials = ref(reactive(emptySourceCredentials()));
  const initial = sourceSettingsSnapshot(form.value, restrictions.value);
  const identityDirty = computed(() =>
    isSourceIdentityDirty(form.value, restrictions.value, initial),
  );
  const dirty = computed(() =>
    isSourceSettingsDirty(form.value, restrictions.value, initial, credentials.value),
  );
  watch(dirty, (value) => emit("dirty", value), { immediate: true });
  watch(
    () =>
      JSON.stringify({
        form: form.value,
        restrictions: restrictions.value,
        credentials: credentials.value,
      }),
    () => {
      impact.value = undefined;
      pending.value = undefined;
      confirmed.value = false;
    },
  );

  async function review(action: SourceSettingsAction): Promise<void> {
    if (props.busy) {
      return;
    }
    error.value = "";
    impact.value = undefined;
    pending.value = undefined;
    confirmed.value = false;
    emit("lock", true);
    try {
      const response = await props.api<SourcePublicationImpact & { sourceVersion: number }>(
        sourceImpactUrl(props.base, props.source.id, expectedVersion),
      );
      if (!live) {
        return;
      }
      if (response.sourceVersion !== expectedVersion) {
        throw new Error(SOURCE_VERSION_CHANGED_MESSAGE);
      }
      impact.value = response;
      pending.value = action;
      await nextTick();
      document.getElementById(`source-impact-${props.source.id}`)?.focus();
    } catch (cause) {
      if (live) {
        error.value =
          cause instanceof Error ? cause.message : "Não foi possível conferir o impacto.";
        clearSourceCredentials(credentials.value);
        await nextTick();
        errorSummary.value?.focus();
      }
    } finally {
      emit("lock", false);
    }
  }

  function save(): void {
    emit("save", {
      ...form.value,
      expectedVersion,
      rowRestrictions: publishedSourceRestrictions(restrictions.value),
    });
  }

  function rotate(): void {
    // Copy for the request and immediately discard secrets from the editable browser state.
    emit("rotate", { ...credentials.value, expectedVersion });
    clearSourceCredentials(credentials.value);
  }

  function confirmChange(): void {
    if (props.busy || !confirmed.value || !impact.value) {
      return;
    }
    const action = pending.value;
    impact.value = undefined;
    pending.value = undefined;
    confirmed.value = false;
    if (action === "save") {
      save();
    }
    if (action === "rotate") {
      rotate();
    }
  }

  function continueEditing(): void {
    impact.value = undefined;
    pending.value = undefined;
    confirmed.value = false;
  }

  return {
    expectedVersion,
    form,
    restrictions,
    credentials,
    impact,
    pending,
    confirmed,
    error,
    errorSummary,
    identityDirty,
    review,
    confirmChange,
    continueEditing,
  };
}
