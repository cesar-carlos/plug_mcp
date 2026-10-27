import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch, type Ref } from "vue";
import type {
  IntegrationReview,
  ManagedIntegration,
} from "../../../src/domain/persona-v2/integration-management";
import {
  clearIntegrationManagementSecrets,
  emptyIntegrationManagementForm,
  integrationCredentialPayload,
  integrationManagementActionPath,
  integrationManagementSavedMessage,
  isIntegrationManagementDirty,
  resetIntegrationManagementForm,
  type IntegrationManagementAction,
  type IntegrationManagementForm,
  type IntegrationManagementMode,
} from "./integration-management";
import { useErrorSummary } from "./useErrorSummary";

export interface IntegrationManagementPanelProps {
  api: <T>(url: string, body?: unknown) => Promise<T>;
  base: string;
  disabled: boolean;
  confirmDiscard: () => Promise<boolean>;
}

export interface IntegrationManagementPanelEmit {
  (event: "dirty", value: boolean): void;
  (event: "lock", value: boolean): void;
}

export interface IntegrationManagementState {
  rows: Ref<readonly ManagedIntegration[]>;
  review: Ref<IntegrationReview | undefined>;
  selected: Ref<string>;
  busy: Ref<boolean>;
  mode: Ref<IntegrationManagementMode>;
  confirmed: Ref<boolean>;
  needsReview: Ref<boolean>;
  message: Ref<string>;
  form: Ref<IntegrationManagementForm>;
  error: Ref<string>;
  errorSummary: Ref<HTMLElement | undefined>;
  select: (event: Event) => Promise<void>;
  refresh: () => Promise<void>;
  begin: (action: IntegrationManagementAction) => Promise<void>;
  save: () => Promise<void>;
  clear: (resetReview?: boolean) => void;
  clearSecrets: () => void;
}

export function useIntegrationManagement(
  props: IntegrationManagementPanelProps,
  emit: IntegrationManagementPanelEmit,
): IntegrationManagementState {
  const rows = shallowRef<readonly ManagedIntegration[]>([]);
  const review = shallowRef<IntegrationReview>();
  const selected = ref("");
  const busy = ref(false);
  const mode = ref<IntegrationManagementMode>("");
  const confirmed = ref(false);
  const needsReview = ref(false);
  const message = ref("");
  const form = ref(emptyIntegrationManagementForm());
  const { error, errorSummary } = useErrorSummary();
  const dirty = computed(() =>
    isIntegrationManagementDirty(mode.value, confirmed.value, form.value),
  );
  watch(dirty, (value) => emit("dirty", value));
  const root = computed(() => `${props.base}/integracoes/gestao`);
  let live = true;
  let stop: (() => void) | undefined;
  let createId = "";

  function clearSecrets(): void {
    clearIntegrationManagementSecrets(form.value);
  }

  function clear(resetReview = false): void {
    resetIntegrationManagementForm(form.value);
    mode.value = "";
    confirmed.value = false;
    if (resetReview) {
      needsReview.value = false;
    }
  }

  onBeforeUnmount(() => {
    live = false;
    stop?.();
    clear();
    rows.value = [];
    review.value = undefined;
    emit("dirty", false);
    emit("lock", false);
  });

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
        error.value =
          cause instanceof Error ? cause.message : "Não foi possível atualizar a integração.";
      }
    } finally {
      busy.value = false;
      if (live) {
        emit("lock", false);
      }
    }
  }

  async function load(): Promise<void> {
    const result = await props.api<{ connections: readonly ManagedIntegration[] }>(root.value);
    if (live) {
      rows.value = result.connections;
    }
  }

  async function select(event: Event): Promise<void> {
    const input = event.target as HTMLSelectElement;
    const next = input.value;
    input.value = selected.value;
    if (dirty.value && !(await props.confirmDiscard())) {
      return;
    }
    await run(async () => {
      const value = next ? await props.api<IntegrationReview>(`${root.value}/${next}`) : undefined;
      if (!live) {
        return;
      }
      clear(true);
      selected.value = next;
      review.value = value;
    });
  }

  async function refresh(): Promise<void> {
    if (dirty.value && !(await props.confirmDiscard())) {
      return;
    }
    await run(async () => {
      await load();
      const created = createId && rows.value.find((row) => row.id === createId);
      if (created) {
        selected.value = created.id;
      }
      const value = selected.value
        ? await props.api<IntegrationReview>(`${root.value}/${selected.value}`)
        : undefined;
      if (live) {
        clear(true);
        review.value = value;
        if (created) {
          createId = "";
          message.value =
            "Cadastro localizado. A integração aguarda publicação; credenciais não são recuperáveis.";
        }
      }
    });
  }

  async function begin(action: IntegrationManagementAction): Promise<void> {
    if (needsReview.value) {
      error.value = "Recarregue o estado e revise antes de outra mudança.";
      return;
    }
    if (dirty.value && !(await props.confirmDiscard())) {
      return;
    }
    if (!live) {
      return;
    }
    clear();
    mode.value = action;
    if (action === "criar" && !createId) {
      createId = globalThis.crypto.randomUUID();
    }
  }

  async function create(): Promise<void> {
    await run(async () => {
      try {
        const credential = integrationCredentialPayload(form.value);
        const value = await props.api<{ id: string }>(root.value, {
          requestId: createId,
          confirmed: "create",
          registration: {
            name: form.value.name,
            kind: form.value.kind,
            destination: form.value.destination,
          },
          owner: { email: form.value.ownerEmail, password: form.value.ownerPassword },
          credential,
        });
        if (!live) {
          return;
        }
        selected.value = value.id;
        clear(true);
        await load();
        const detail = await props.api<IntegrationReview>(`${root.value}/${value.id}`);
        if (live) {
          createId = "";
          review.value = detail;
          message.value =
            "Integração cadastrada e desativada. Selecione operações, treine e publique uma skill antes do uso.";
        }
      } catch (cause) {
        if (live) {
          needsReview.value = true;
        }
        throw cause;
      } finally {
        clearSecrets();
        confirmed.value = false;
      }
    });
  }

  async function save(): Promise<void> {
    if (!confirmed.value || !mode.value || needsReview.value) {
      return;
    }
    if (mode.value === "criar") {
      await create();
      return;
    }
    if (!review.value) {
      return;
    }
    const action = mode.value;
    const connection = review.value.connection;
    await run(async () => {
      try {
        const credential = integrationCredentialPayload(form.value);
        await props.api(integrationManagementActionPath(root.value, connection.id, action), {
          expectedVersion: connection.managementVersion,
          fingerprint: review.value!.fingerprint,
          confirmed: true,
          ...(action === "rotacionar"
            ? {
                owner: { email: form.value.ownerEmail, password: form.value.ownerPassword },
                credential,
              }
            : {}),
        });
        if (!live) {
          return;
        }
        clear(true);
        await load();
        const value = await props.api<IntegrationReview>(`${root.value}/${connection.id}`);
        if (live) {
          review.value = value;
          message.value = integrationManagementSavedMessage(action);
        }
      } catch (cause) {
        if (live) {
          needsReview.value = true;
        }
        throw cause;
      } finally {
        clearSecrets();
        confirmed.value = false;
      }
    });
  }

  onMounted(() => {
    let started = false;
    stop = watch(
      () => props.disabled,
      (disabled) => {
        if (!disabled && !started && live) {
          started = true;
          void run(load);
        }
      },
      { immediate: true, flush: "post" },
    );
  });

  return {
    rows,
    review,
    selected,
    busy,
    mode,
    confirmed,
    needsReview,
    message,
    form,
    error,
    errorSummary,
    select,
    refresh,
    begin,
    save,
    clear,
    clearSecrets,
  };
}
