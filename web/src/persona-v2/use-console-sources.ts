import { computed, nextTick, reactive, ref, type ComputedRef, type Ref } from "vue";
import { matchesSearch } from "./list-search";
import { ConsoleRequestError, type Source } from "./model";
import { emptySourceForm, isSourceFormDirty, type SourceForm } from "./source-form";

export function useConsoleSources(
  sources: Ref<Source[]>,
  api: <T>(url: string, body?: unknown) => Promise<T>,
  run: (action: () => Promise<void>) => Promise<void>,
  confirmDiscard: () => Promise<boolean>,
  load: () => Promise<void>,
  path: () => string,
  message: Ref<string>,
  clearDependentEditors: () => void,
): {
  sourceForm: SourceForm;
  sourceReplacement: Ref<{ id: string; version: number; name: string } | undefined>;
  replacementConfirmed: Ref<boolean>;
  sourceOpen: Ref<boolean>;
  sourceSearch: Ref<string>;
  matchingSources: ComputedRef<Source[]>;
  highlightedSourceId: Ref<string>;
  sourceFormVersions: Record<string, number>;
  sourcesDirty: Record<string, boolean>;
  sourceLifecycleDirty: Record<string, boolean>;
  sourceDirty: ComputedRef<boolean>;
  resetSourceForm: () => void;
  remountSourceEditors: () => void;
  clearSourceState: () => void;
  addSource: () => Promise<void>;
  beginSourceReplacement: (source: Source) => Promise<void>;
  cancelSourceReplacement: () => Promise<void>;
  changeSourceState: (sourceId: string, active: boolean, input: unknown) => Promise<void>;
  saveSource: (sourceId: string, input: unknown, rotate?: boolean) => Promise<void>;
  reloadSource: (sourceId: string) => Promise<void>;
} {
  const sourceForm = reactive(emptySourceForm());
  const sourceReplacement = ref<{ id: string; version: number; name: string }>();
  const replacementConfirmed = ref(false);
  const sourceOpen = ref(false);
  const sourceSearch = ref("");
  const highlightedSourceId = ref("");
  const sourceFormVersions = reactive<Record<string, number>>({});
  const sourcesDirty = reactive<Record<string, boolean>>({});
  const sourceLifecycleDirty = reactive<Record<string, boolean>>({});
  const matchingSources = computed(() =>
    sources.value.filter((source) =>
      matchesSearch(sourceSearch.value, source.name, source.dialect),
    ),
  );
  const sourceDirty = computed(() => isSourceFormDirty(sourceForm, !!sourceReplacement.value));

  function resetSourceForm(): void {
    sourceReplacement.value = undefined;
    replacementConfirmed.value = false;
    Object.assign(sourceForm, emptySourceForm());
  }

  function remountSourceEditors(): void {
    resetSourceForm();
    sourceOpen.value = false;
    for (const id of Object.keys(sourcesDirty)) {
      sourcesDirty[id] = false;
      sourceFormVersions[id] = (sourceFormVersions[id] ?? 0) + 1;
    }
    for (const id of Object.keys(sourceLifecycleDirty)) {
      sourceLifecycleDirty[id] = false;
    }
  }

  function clearSourceState(): void {
    sourceSearch.value = "";
    highlightedSourceId.value = "";
    Object.keys(sourcesDirty).forEach((id) => {
      delete sourcesDirty[id];
    });
    Object.keys(sourceLifecycleDirty).forEach((id) => {
      delete sourceLifecycleDirty[id];
    });
    Object.keys(sourceFormVersions).forEach((id) => {
      delete sourceFormVersions[id];
    });
    resetSourceForm();
    sourceOpen.value = false;
  }

  async function addSource(): Promise<void> {
    if (sourceReplacement.value && !replacementConfirmed.value) {
      return;
    }
    await run(async () => {
      const replacement = sourceReplacement.value;
      try {
        const response = await api<{ fonte: Source }>(
          replacement ? `${path()}/fontes/${replacement.id}/substituir` : `${path()}/fontes`,
          replacement ? { expectedVersion: replacement.version, source: sourceForm } : sourceForm,
        );
        if (replacement) {
          sourceFormVersions[replacement.id] = (sourceFormVersions[replacement.id] ?? 0) + 1;
        }
        await load();
        resetSourceForm();
        sourceOpen.value = false;
        highlightedSourceId.value = response.fonte.id;
        message.value = replacement
          ? "Nova base verificada. O vínculo anterior ficou no histórico; treine, publique e conceda acesso explicitamente à substituta."
          : "Base conectada. Agora cadastre o treinamento dessa fonte.";
        await nextTick();
        document.getElementById(`source-${response.fonte.id}`)?.focus();
      } finally {
        sourceForm.password = "";
        sourceForm.email = "";
        sourceForm.clientToken = "";
      }
    });
  }

  async function beginSourceReplacement(source: Source): Promise<void> {
    sourceLifecycleDirty[source.id] = false;
    if ((sourceDirty.value || sourcesDirty[source.id]) && !(await confirmDiscard())) {
      return;
    }
    if (sourcesDirty[source.id]) {
      sourcesDirty[source.id] = false;
      sourceFormVersions[source.id] = (sourceFormVersions[source.id] ?? 0) + 1;
    }
    resetSourceForm();
    Object.assign(sourceForm, {
      name: source.name,
      purpose: source.purpose,
      environment: source.environment,
      dialect: source.dialect,
    });
    sourceReplacement.value = {
      id: source.id,
      version: source.authorizationVersion,
      name: source.name,
    };
    sourceOpen.value = true;
    await nextTick();
    document.getElementById("source-registration")?.focus();
  }

  async function cancelSourceReplacement(): Promise<void> {
    if (sourceDirty.value && !(await confirmDiscard())) {
      return;
    }
    resetSourceForm();
    sourceOpen.value = false;
  }

  async function changeSourceState(
    sourceId: string,
    active: boolean,
    input: unknown,
  ): Promise<void> {
    sourceLifecycleDirty[sourceId] = false;
    if (sourcesDirty[sourceId] && !(await confirmDiscard())) {
      return;
    }
    await run(async () => {
      clearDependentEditors();
      let changed = false;
      try {
        await api(`${path()}/fontes/${sourceId}/${active ? "recuperar" : "suspender"}`, input);
        changed = true;
      } finally {
        await load();
        if (changed) {
          sourcesDirty[sourceId] = false;
          sourceFormVersions[sourceId] = (sourceFormVersions[sourceId] ?? 0) + 1;
        }
      }
      message.value = active
        ? "Mesma base confirmada e vínculo recuperado. Revise e publique novamente as skills; nenhuma permissão nova foi concedida."
        : "Fonte suspensa, incluindo publicações e cruzamentos dependentes. As outras fontes continuam independentes.";
    });
  }

  async function saveSource(sourceId: string, input: unknown, rotate = false): Promise<void> {
    await run(async () => {
      clearDependentEditors();
      try {
        await api(`${path()}/fontes/${sourceId}/${rotate ? "credencial" : "editar"}`, input);
      } catch (cause) {
        // A conflict needs explicit reload: a background request must not delay or
        // replace its error, nor silently refresh the context of a pending edit.
        if (!(cause instanceof ConsoleRequestError && cause.code === "OPERATION_CONFLICT")) {
          await load();
        }
        throw cause;
      }
      sourcesDirty[sourceId] = false;
      await load();
      sourceFormVersions[sourceId] = (sourceFormVersions[sourceId] ?? 0) + 1;
      message.value = rotate
        ? "Credenciais verificadas e trocadas. Revise e publique novamente o treinamento desta fonte."
        : "Base atualizada. Revise e publique novamente o treinamento desta fonte.";
    });
  }

  async function reloadSource(sourceId: string): Promise<void> {
    if ((sourcesDirty[sourceId] || sourceLifecycleDirty[sourceId]) && !(await confirmDiscard())) {
      return;
    }
    await run(async () => {
      await load();
      sourcesDirty[sourceId] = false;
      sourceLifecycleDirty[sourceId] = false;
      sourceFormVersions[sourceId] = (sourceFormVersions[sourceId] ?? 0) + 1;
    });
  }

  return {
    sourceForm,
    sourceReplacement,
    replacementConfirmed,
    sourceOpen,
    sourceSearch,
    matchingSources,
    highlightedSourceId,
    sourceFormVersions,
    sourcesDirty,
    sourceLifecycleDirty,
    sourceDirty,
    resetSourceForm,
    remountSourceEditors,
    clearSourceState,
    addSource,
    beginSourceReplacement,
    cancelSourceReplacement,
    changeSourceState,
    saveSource,
    reloadSource,
  };
}
