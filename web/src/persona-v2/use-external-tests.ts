import { computed, onBeforeUnmount, onMounted, ref, watch, type ComputedRef, type Ref } from "vue";
import type { TrainingCase } from "../../../src/domain/persona-v2/catalog";
import type { ExternalTestDetails } from "../../../src/domain/persona-v2/external-run";
import {
  editExternalValues,
  readExternalValues,
  type ExternalTestValue,
} from "./external-test-values";
import {
  appendExternalTestReports,
  externalTestCaseFingerprint,
  externalTestCaseName,
  externalTestCaseRecord,
  externalTestSavedMessage,
  isExternalTestCaseDirty,
  type ExternalTestSkill,
} from "./external-tests";
import { useErrorSummary } from "./useErrorSummary";

export interface ExternalTestsPanelProps {
  api: <T>(url: string, body?: unknown) => Promise<T>;
  base: string;
  disabled: boolean;
  confirmDiscard: () => Promise<boolean>;
  skillId?: string;
}

export interface ExternalTestsPanelEmit {
  (event: "dirty", value: boolean): void;
  (event: "lock", value: boolean): void;
  (event: "updated", value: ExternalTestDetails): void;
}

export interface ExternalTestsState {
  skills: Ref<ExternalTestSkill[]>;
  details: Ref<ExternalTestDetails | undefined>;
  busy: Ref<boolean>;
  message: Ref<string>;
  name: Ref<string>;
  required: Ref<boolean>;
  caseId: Ref<string>;
  removeConfirmed: Ref<boolean>;
  editing: Ref<boolean>;
  input: Ref<Record<string, ExternalTestValue>>;
  expected: Ref<Record<string, ExternalTestValue>>;
  error: Ref<string>;
  errorSummary: Ref<HTMLElement | undefined>;
  dirty: ComputedRef<boolean>;
  refreshTests: () => Promise<void>;
  reset: () => void;
  select: (id: string) => Promise<void>;
  edit: (test?: TrainingCase) => Promise<void>;
  save: (remove?: boolean) => Promise<void>;
  close: () => Promise<void>;
  more: () => Promise<void>;
}

export function useExternalTests(
  props: ExternalTestsPanelProps,
  emit: ExternalTestsPanelEmit,
): ExternalTestsState {
  const skills = ref<ExternalTestSkill[]>([]);
  const details = ref<ExternalTestDetails>();
  const busy = ref(false);
  const message = ref("");
  const name = ref("");
  const required = ref(true);
  const caseId = ref("");
  const removeConfirmed = ref(false);
  const editing = ref(false);
  const saved = ref("");
  const input = ref<Record<string, ExternalTestValue>>({});
  const expected = ref<Record<string, ExternalTestValue>>({});
  const { error, errorSummary } = useErrorSummary();
  const fingerprint = computed(() =>
    externalTestCaseFingerprint({
      name: name.value,
      required: required.value,
      input: input.value,
      expected: expected.value,
    }),
  );
  const dirty = computed(() =>
    isExternalTestCaseDirty({
      editing: editing.value,
      fingerprint: fingerprint.value,
      saved: saved.value,
      removeConfirmed: removeConfirmed.value,
    }),
  );
  watch(dirty, (value) => emit("dirty", value), { immediate: true });
  const root = computed(() => `${props.base}/integracoes/skills`);
  let live = true;
  let initialized = false;

  onBeforeUnmount(() => {
    live = false;
    input.value = {};
    expected.value = {};
    details.value = undefined;
    emit("dirty", false);
    emit("lock", false);
  });

  async function run(fn: () => Promise<void>): Promise<void> {
    if (busy.value || props.disabled) {
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
        error.value = cause instanceof Error ? cause.message : "Testes indisponíveis.";
      }
    } finally {
      busy.value = false;
      if (live) {
        emit("lock", false);
      }
    }
  }

  async function load(): Promise<void> {
    if (props.skillId) {
      const result = await props.api<ExternalTestDetails>(`${root.value}/${props.skillId}/testes`);
      if (live) {
        details.value = result;
        emit("updated", result);
      }
      return;
    }
    const result = await props.api<{ skills: ExternalTestSkill[] }>(root.value);
    if (live) {
      skills.value = result.skills;
    }
  }

  async function refreshTests(): Promise<void> {
    if (busy.value || props.disabled) {
      return;
    }
    if (dirty.value && !(await props.confirmDiscard())) {
      return;
    }
    await run(async () => {
      await load();
      if (live) {
        reset();
      }
    });
  }

  function reset(): void {
    editing.value = false;
    name.value = "";
    caseId.value = "";
    input.value = {};
    expected.value = {};
    removeConfirmed.value = false;
    saved.value = fingerprint.value;
  }

  async function select(id: string): Promise<void> {
    if (busy.value || props.disabled) {
      return;
    }
    if (dirty.value && !(await props.confirmDiscard())) {
      return;
    }
    await run(async () => {
      const result = await props.api<ExternalTestDetails>(`${root.value}/${id}/testes`);
      if (!live) {
        return;
      }
      details.value = result;
      emit("updated", result);
      reset();
    });
  }

  async function edit(test?: TrainingCase): Promise<void> {
    if (!details.value || busy.value || props.disabled) {
      return;
    }
    if (dirty.value && !(await props.confirmDiscard())) {
      return;
    }
    name.value = test ? externalTestCaseName(test.content) : "";
    required.value = test?.required ?? true;
    caseId.value = test?.id ?? "";
    input.value = editExternalValues(
      details.value.contract.input,
      test ? externalTestCaseRecord(test.content, "input") : undefined,
    );
    expected.value = editExternalValues(
      details.value.contract.output,
      test ? externalTestCaseRecord(test.content, "expected") : undefined,
    );
    saved.value = fingerprint.value;
    removeConfirmed.value = false;
    editing.value = true;
  }

  async function save(remove = false): Promise<void> {
    const current = details.value;
    if (!current || !editing.value || (remove && !removeConfirmed.value)) {
      return;
    }
    await run(async () => {
      const content = remove
        ? current.cases.find((item) => item.id === caseId.value)!.content
        : {
            name: name.value,
            input: readExternalValues(current.contract.input, input.value),
            expected: readExternalValues(current.contract.output, expected.value),
          };
      await props.api(`${root.value}/${current.skillId}/casos`, {
        expectedRevision: current.revision,
        ...(caseId.value ? { id: caseId.value } : {}),
        remove,
        required: required.value,
        content,
      });
      if (!live) {
        return;
      }
      reset();
      const updated = await props.api<ExternalTestDetails>(
        `${root.value}/${current.skillId}/testes`,
      );
      if (!live) {
        return;
      }
      details.value = updated;
      emit("updated", updated);
      message.value = externalTestSavedMessage(remove);
    });
  }

  async function close(): Promise<void> {
    if (!dirty.value || (await props.confirmDiscard())) {
      reset();
    }
  }

  async function more(): Promise<void> {
    const current = details.value;
    if (!current?.nextCursor) {
      return;
    }
    await run(async () => {
      const result = await props.api<ExternalTestDetails>(
        `${root.value}/${current.skillId}/testes?after=${encodeURIComponent(current.nextCursor!)}`,
      );
      if (!live) {
        return;
      }
      details.value = appendExternalTestReports(current, result);
    });
  }

  function initialize(): void {
    if (!props.disabled && !initialized && live) {
      initialized = true;
      void run(load);
    }
  }

  onMounted(initialize);
  watch(() => props.disabled, initialize, { flush: "post" });

  return {
    skills,
    details,
    busy,
    message,
    name,
    required,
    caseId,
    removeConfirmed,
    editing,
    input,
    expected,
    error,
    errorSummary,
    dirty,
    refreshTests,
    reset,
    select,
    edit,
    save,
    close,
    more,
  };
}
