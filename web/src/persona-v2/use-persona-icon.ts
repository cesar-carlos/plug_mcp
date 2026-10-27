import { computed, onBeforeUnmount, onMounted, ref, watch, type ComputedRef, type Ref } from "vue";
import { ConsoleRequestError } from "./model";
import { useErrorSummary } from "./useErrorSummary";
import {
  fileChoice,
  fileToBase64,
  personaIconConflictMessage,
  personaIconFileError,
  personaIconPath,
  personaIconReloadMessage,
  personaIconSavedMessage,
  personaIconSrc,
  type PersonaIconChoice,
} from "./persona-icon";

export interface PersonaIconProps {
  base: string;
  busy: boolean;
  api: <T>(url: string, body?: unknown) => Promise<T>;
}

export interface PersonaIconEmit {
  (event: "dirty", value: boolean): void;
  (event: "current", value: { base: string; revision: number; hasIcon: boolean }): void;
}

export interface PersonaIconFormHandle {
  clearFile: () => void;
  focusFile: () => void;
}

export interface PersonaIconState {
  revision: Ref<number>;
  hasIcon: Ref<boolean>;
  loading: Ref<boolean>;
  loaded: Ref<boolean>;
  saving: Ref<boolean>;
  saved: Ref<string>;
  showMascots: Ref<boolean>;
  choosingMascot: Ref<boolean>;
  selectedMascot: Ref<string | null>;
  savedMascot: Ref<string | null>;
  needsReload: Ref<boolean>;
  locked: ComputedRef<boolean>;
  dirty: ComputedRef<boolean>;
  shown: ComputedRef<string>;
  error: Ref<string>;
  errorSummary: Ref<HTMLElement | undefined>;
  iconForm: Ref<PersonaIconFormHandle | undefined>;
  load: () => Promise<void>;
  selectFile: (event: Event) => void;
  useDefault: () => void;
  chooseMascot: (file: File, id: string) => void;
  discard: () => void;
  save: () => Promise<void>;
}

export function usePersonaIcon(props: PersonaIconProps, emit: PersonaIconEmit): PersonaIconState {
  const revision = ref(0);
  const hasIcon = ref(false);
  const chosen = ref<PersonaIconChoice>(null);
  const previewUrl = ref("");
  const loading = ref(false);
  const loaded = ref(false);
  const saving = ref(false);
  const saved = ref("");
  const showMascots = ref(false);
  const choosingMascot = ref(false);
  const selectedMascot = ref<string | null>(null);
  const savedMascot = ref<string | null>(null);
  const needsReload = ref(false);
  const iconForm = ref<PersonaIconFormHandle>();
  const locked = computed(
    () => props.busy || loading.value || saving.value || choosingMascot.value,
  );
  const { error, errorSummary } = useErrorSummary();
  let live = true;
  const dirty = computed(() => chosen.value !== null);
  watch(dirty, (value) => emit("dirty", value), { immediate: true });
  const shown = computed(() =>
    personaIconSrc({
      previewUrl: previewUrl.value,
      chosen: chosen.value,
      hasIcon: hasIcon.value,
      base: props.base,
      revision: revision.value,
    }),
  );

  function releasePreview(): void {
    if (previewUrl.value) {
      URL.revokeObjectURL(previewUrl.value);
    }
    previewUrl.value = "";
  }

  function clearFileInput(): void {
    iconForm.value?.clearFile();
  }

  onBeforeUnmount(() => {
    live = false;
    releasePreview();
  });

  async function load(): Promise<void> {
    if (loading.value || saving.value || choosingMascot.value || !live) {
      return;
    }
    loading.value = true;
    error.value = "";
    try {
      const result = await props.api<{ revision: number; hasIcon: boolean }>(
        personaIconPath(props.base),
      );
      if (!live) {
        return;
      }
      revision.value = result.revision;
      hasIcon.value = result.hasIcon;
      loaded.value = true;
      savedMascot.value = null;
      emit("current", { base: props.base, ...result });
      if (needsReload.value) {
        saved.value = personaIconReloadMessage(dirty.value);
      }
      needsReload.value = false;
    } catch (cause) {
      if (live) {
        error.value = cause instanceof Error ? cause.message : "Não foi possível ler o ícone.";
      }
    } finally {
      loading.value = false;
    }
  }

  onMounted(() => {
    void load();
  });

  function selectFile(event: Event): void {
    if (locked.value || !loaded.value) {
      return;
    }
    const input = fileChoice(event.target);
    const file = input?.files?.item(0) ?? null;
    if (!input || !file) {
      return;
    }
    const invalid = personaIconFileError(file);
    if (invalid) {
      error.value = invalid;
      input.value = "";
      return;
    }
    releasePreview();
    saved.value = "";
    error.value = "";
    chosen.value = file;
    selectedMascot.value = null;
    previewUrl.value = URL.createObjectURL(file);
  }

  function useDefault(): void {
    if (locked.value || !loaded.value) {
      return;
    }
    releasePreview();
    error.value = "";
    saved.value = "";
    clearFileInput();
    chosen.value = hasIcon.value ? "padrao" : null;
    selectedMascot.value = null;
  }

  function chooseMascot(file: File, id: string): void {
    if (!live || props.busy || loading.value || saving.value || !loaded.value) {
      return;
    }
    releasePreview();
    error.value = "";
    saved.value = "";
    clearFileInput();
    chosen.value = file;
    selectedMascot.value = id;
    previewUrl.value = URL.createObjectURL(file);
  }

  function discard(): void {
    if (locked.value) {
      return;
    }
    chosen.value = null;
    selectedMascot.value = null;
    releasePreview();
    clearFileInput();
    if (!needsReload.value) {
      error.value = "";
    }
    saved.value = "Alterações locais descartadas.";
    iconForm.value?.focusFile();
  }

  async function save(): Promise<void> {
    if (locked.value || !loaded.value || needsReload.value) {
      return;
    }
    const selection = chosen.value;
    if (!selection) {
      return;
    }
    saving.value = true;
    saved.value = "";
    error.value = "";
    try {
      const image = selection === "padrao" ? null : await fileToBase64(selection);
      if (!live) {
        return;
      }
      const result = await props.api<{ revision: number; hasIcon: boolean }>(
        personaIconPath(props.base),
        {
          expectedRevision: revision.value,
          image,
        },
      );
      if (!live) {
        return;
      }
      revision.value = result.revision;
      hasIcon.value = result.hasIcon;
      savedMascot.value = selectedMascot.value;
      selectedMascot.value = null;
      emit("current", { base: props.base, ...result });
      chosen.value = null;
      clearFileInput();
      saved.value = personaIconSavedMessage(selection);
      releasePreview();
    } catch (cause) {
      if (!live) {
        return;
      }
      if (
        cause instanceof ConsoleRequestError &&
        ["OPERATION_CONFLICT", "RESPONSE_UNCONFIRMED"].includes(cause.code)
      ) {
        needsReload.value = true;
        error.value = personaIconConflictMessage(cause.code) ?? cause.message;
      } else {
        error.value = cause instanceof Error ? cause.message : "Não foi possível salvar o ícone.";
      }
    } finally {
      saving.value = false;
    }
  }

  return {
    revision,
    hasIcon,
    loading,
    loaded,
    saving,
    saved,
    showMascots,
    choosingMascot,
    selectedMascot,
    savedMascot,
    needsReload,
    locked,
    dirty,
    shown,
    error,
    errorSummary,
    iconForm,
    load,
    selectFile,
    useDefault,
    chooseMascot,
    discard,
    save,
  };
}
