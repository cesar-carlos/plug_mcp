import { computed, nextTick, onBeforeUnmount, ref, watch, type Ref } from "vue";
import { schemaInspectionSchema } from "../../../src/domain/persona-v2/source-schema";
import {
  inspectionResultSchema,
  scopeForContent,
  type Inspection,
  type Resource,
  type Content,
} from "./knowledge-model";
import type { Source } from "./model";
import {
  SOURCE_INSPECTION_PAGE_SIZE,
  appendInspectionResource,
  emptyInspectionResource,
  inspectionComposeBody,
  inspectionHasExpired,
  isInconclusiveComposition,
  liveInspectionPages,
  replaceInspectionPage,
  sourceInspectionErrorMessage,
  sourceInspectionFingerprint,
  sourceInspectionInvalidScopeMessage,
  sourceInspectionScopeFingerprint,
} from "./source-inspection";
import { useErrorSummary } from "./useErrorSummary";

export interface SourceInspectionPanelProps {
  source: Source;
  sourceBase: string;
  api: <T>(url: string, body?: unknown) => Promise<T>;
  disabled: boolean;
  content?: Content;
}

export interface SourceInspectionPanelEmit {
  (event: "result", value: Inspection | undefined): void;
  (event: "dirty", value: boolean): void;
  (event: "lock", value: boolean): void;
}

export interface SourceInspectionState {
  resources: Ref<Resource[]>;
  pages: Ref<Inspection[]>;
  result: Ref<Inspection | undefined>;
  busy: Ref<boolean>;
  expired: Ref<boolean>;
  error: Ref<string>;
  errorSummary: Ref<HTMLElement | undefined>;
  usePublishedScope: () => void;
  addResource: () => void;
  removeResource: (index: number) => void;
  inspect: (nextOffset?: number) => Promise<void>;
  compose: () => Promise<void>;
}

export function useSourceInspection(
  props: SourceInspectionPanelProps,
  emit: SourceInspectionPanelEmit,
): SourceInspectionState {
  const resources = ref<Resource[]>([emptyInspectionResource(props.source.dialect)]);
  const offset = ref(0);
  const pages = ref<Inspection[]>([]);
  const result = ref<Inspection>();
  const busy = ref(false);
  const expired = ref(false);
  const { error, errorSummary } = useErrorSummary();
  const fingerprint = computed(() =>
    sourceInspectionFingerprint({
      resources: resources.value,
      offset: offset.value,
      sourceId: props.source.id,
      version: props.source.authorizationVersion,
      active: props.source.active,
    }),
  );
  const scopeFingerprint = computed(() =>
    sourceInspectionScopeFingerprint({
      resources: resources.value,
      sourceId: props.source.id,
      version: props.source.authorizationVersion,
      active: props.source.active,
    }),
  );
  watch(scopeFingerprint, () => {
    pages.value = [];
    offset.value = 0;
  });
  const saved = ref(fingerprint.value);
  let live = true;
  let epoch = 0;
  watch(fingerprint, () => {
    epoch++;
    result.value = undefined;
    expired.value = false;
    emit("result", undefined);
    emit("dirty", fingerprint.value !== saved.value);
  });
  const timer = window.setInterval(() => {
    pages.value = liveInspectionPages(pages.value, Date.now());
    if (result.value && inspectionHasExpired(result.value.expiresAt, Date.now())) {
      result.value = undefined;
      expired.value = true;
      emit("result", undefined);
    }
  }, 1000);
  onBeforeUnmount(() => {
    live = false;
    epoch++;
    window.clearInterval(timer);
    emit("dirty", false);
  });

  function usePublishedScope(): void {
    try {
      if (!props.content) {
        return;
      }
      resources.value = scopeForContent(props.content, props.source.dialect);
      offset.value = 0;
      error.value = "";
    } catch (cause) {
      error.value = sourceInspectionErrorMessage(cause, "Revise o escopo.");
    }
  }

  function addResource(): void {
    resources.value.push(appendInspectionResource(resources.value));
    offset.value = 0;
  }

  function removeResource(index: number): void {
    resources.value.splice(index, 1);
    offset.value = 0;
  }

  async function inspect(nextOffset = 0): Promise<void> {
    if (busy.value || props.disabled || !props.source.active) {
      return;
    }
    busy.value = true;
    emit("lock", true);
    const scope = scopeFingerprint.value;
    const sourceBase = props.sourceBase;
    let version = epoch;
    try {
      error.value = "";
      if (nextOffset === 0) {
        pages.value = [];
      }
      result.value = undefined;
      emit("result", undefined);
      offset.value = nextOffset;
      await nextTick();
      if (!live || scope !== scopeFingerprint.value || sourceBase !== props.sourceBase) {
        return;
      }
      version = epoch;
      const input = schemaInspectionSchema.safeParse({
        resources: resources.value,
        offset: nextOffset,
        pageSize: SOURCE_INSPECTION_PAGE_SIZE,
      });
      if (!input.success) {
        throw new Error(sourceInspectionInvalidScopeMessage);
      }
      const data = inspectionResultSchema.parse(
        await props.api<unknown>(`${sourceBase}/estrutura`, input.data),
      );
      if (!live || version !== epoch) {
        return;
      }
      if (data.sourceId !== props.source.id) {
        throw new Error("Resposta de outra base descartada.");
      }
      result.value = data;
      pages.value = replaceInspectionPage(pages.value, data, nextOffset);
      saved.value = fingerprint.value;
      expired.value = false;
      emit("result", data);
      emit("dirty", false);
    } catch (cause) {
      if (live && version === epoch) {
        error.value = sourceInspectionErrorMessage(cause, "Não foi possível inspecionar.");
      }
    } finally {
      if (live) {
        busy.value = false;
      }
      emit("lock", false);
    }
  }

  async function compose(): Promise<void> {
    if (busy.value || props.disabled || !props.source.active || pages.value.length < 2) {
      return;
    }
    error.value = "";
    const version = epoch;
    busy.value = true;
    emit("lock", true);
    try {
      const raw = await props.api<unknown>(
        `${props.sourceBase}/estrutura/compor`,
        inspectionComposeBody(pages.value),
      );
      if (!live || version !== epoch) {
        return;
      }
      if (isInconclusiveComposition(raw)) {
        throw new Error(
          "Páginas incompletas ou conflitantes. Inspecione novamente o escopo inteiro.",
        );
      }
      const data = inspectionResultSchema.parse(raw);
      if (data.sourceId !== props.source.id || !data.evidence.composition) {
        throw new Error("Composição de outra base ou sem origem descartada.");
      }
      result.value = data;
      expired.value = false;
      emit("result", data);
    } catch (cause) {
      if (live && version === epoch) {
        result.value = undefined;
        emit("result", undefined);
        error.value = sourceInspectionErrorMessage(cause, "Não foi possível combinar páginas.");
      }
    } finally {
      if (live) {
        busy.value = false;
      }
      emit("lock", false);
    }
  }

  return {
    resources,
    pages,
    result,
    busy,
    expired,
    error,
    errorSummary,
    usePublishedScope,
    addResource,
    removeResource,
    inspect,
    compose,
  };
}
