import { computed, onBeforeUnmount, onMounted, ref, watch, type ComputedRef, type Ref } from "vue";
import type { ExternalContract } from "../../../src/domain/persona-v2/external-contract";
import type { ExternalReconciliation } from "../../../src/domain/persona-v2/external-reconciliation";
import type { OperationRetention } from "../../../src/domain/persona-v2/operation-retention";
import { usePanelRun } from "./use-panel-run";

export interface ExternalActionRow {
  operationId: string;
  fingerprint: string;
  state: string;
  expiresAt: string;
  requireHumanApproval: boolean;
  version: number;
  receipt: unknown;
  reconciliation?: ExternalReconciliation | null;
  retention?: OperationRetention;
}

export interface ExternalActionReview extends ExternalActionRow {
  name: string;
  contract: ExternalContract | null;
  input: Record<string, string | number | boolean> | null;
  limits: { timeoutMs: number; maxBytes: number } | null;
}

export interface ExternalActionReviewProps {
  api: <T>(url: string, body?: unknown) => Promise<T>;
  base: string;
  disabled: boolean;
  confirmDiscard: () => Promise<boolean>;
}

export interface ExternalActionReviewEmit {
  (event: "lock", value: boolean): void;
  (event: "dirty", value: boolean): void;
}

export interface ExternalActionReviewState {
  consumerDirty: Ref<boolean>;
  preparationDirty: Ref<boolean>;
  rows: Ref<ExternalActionRow[]>;
  selected: Ref<ExternalActionReview | undefined>;
  busy: Ref<boolean>;
  error: Ref<string>;
  message: Ref<string>;
  confirmed: Ref<boolean>;
  cursor: Ref<string | null>;
  now: Ref<number>;
  states: Record<string, string>;
  mayApprove: ComputedRef<boolean>;
  run: (action: () => Promise<void>) => Promise<void>;
  load: (more?: boolean) => Promise<void>;
  review: (id: string) => Promise<void>;
  approve: () => Promise<void>;
}

export const externalActionReviewStates: Record<string, string> = {
  preparada: "Preparada",
  aprovacao_pendente: "Aprovação pendente",
  aprovada: "Aprovada",
  executando: "Em execução",
  concluida: "Resposta recebida",
  resultado_desconhecido: "Resultado desconhecido",
  cancelada: "Cancelada antes do envio",
  expirada: "Expirada",
  recusada: "Recusada",
};

export function externalActionStateLabel(state: string): string {
  return externalActionReviewStates[state] ?? state;
}

export function externalActionReviewDirty(
  confirmed: boolean,
  consumerDirty: boolean,
  preparationDirty: boolean,
): boolean {
  return confirmed || consumerDirty || preparationDirty;
}

export function externalActionReviewNeedsDiscard(
  confirmed: boolean,
  consumerDirty: boolean,
): boolean {
  return confirmed || consumerDirty;
}

export function mayApproveExternalAction(input: {
  state: string | undefined;
  expiresAt: string | undefined;
  confirmed: boolean;
  now: number;
}): boolean {
  return (
    input.state === "aprovacao_pendente" &&
    !!input.expiresAt &&
    Date.parse(input.expiresAt) > input.now &&
    input.confirmed
  );
}

export function externalActionApprovalReference(action: {
  readonly operationId: string;
  readonly fingerprint: string;
}): { operationId: string; fingerprint: string } {
  return { operationId: action.operationId, fingerprint: action.fingerprint };
}

export function externalActionListUrl(base: string, more: boolean, cursor: string | null): string {
  return `${base}/external-actions${more && cursor ? `?after=${encodeURIComponent(cursor)}` : ""}`;
}

export function externalActionApprovedMessage(): string {
  return "Conteúdo aprovado. A execução depende do consumidor e das permissões vigentes.";
}

export function externalReconciliationLabel(status: ExternalReconciliation["status"]): string {
  return status === "applied_verified"
    ? "evidência corresponde ao contrato treinado"
    : "evidência inconclusiva";
}

export function useExternalActionReview(
  props: ExternalActionReviewProps,
  emit: ExternalActionReviewEmit,
): ExternalActionReviewState {
  const consumerDirty = ref(false);
  const preparationDirty = ref(false);
  const rows = ref<ExternalActionRow[]>([]);
  const selected = ref<ExternalActionReview>();
  const confirmed = ref(false);
  const cursor = ref<string | null>(null);
  const now = ref(Date.now());
  const { busy, error, message, isLive, run } = usePanelRun(
    { disabled: () => props.disabled, fallbackError: "Ação indisponível." },
    emit,
  );
  watch([confirmed, consumerDirty, preparationDirty], () => {
    emit(
      "dirty",
      externalActionReviewDirty(confirmed.value, consumerDirty.value, preparationDirty.value),
    );
  });
  const mayApprove = computed(() =>
    mayApproveExternalAction({
      state: selected.value?.state,
      expiresAt: selected.value?.expiresAt,
      confirmed: confirmed.value,
      now: now.value,
    }),
  );
  let initialized = false;
  const timer = window.setInterval(() => {
    now.value = Date.now();
  }, 1000);

  onBeforeUnmount(() => {
    selected.value = undefined;
    rows.value = [];
    window.clearInterval(timer);
    emit("dirty", false);
  });

  async function load(more = false): Promise<void> {
    const result = await props.api<{ operations: ExternalActionRow[]; nextCursor: string | null }>(
      externalActionListUrl(props.base, more, cursor.value),
    );
    if (!isLive()) {
      return;
    }
    rows.value = more ? [...rows.value, ...result.operations] : result.operations;
    cursor.value = result.nextCursor;
  }

  async function review(id: string): Promise<void> {
    if (busy.value || props.disabled) {
      return;
    }
    if (
      externalActionReviewNeedsDiscard(confirmed.value, consumerDirty.value) &&
      !(await props.confirmDiscard())
    ) {
      return;
    }
    if (!isLive() || props.disabled) {
      return;
    }
    selected.value = undefined;
    confirmed.value = false;
    await run(async () => {
      const result = await props.api<ExternalActionReview>(`${props.base}/external-actions/${id}`);
      if (isLive()) {
        selected.value = result;
      }
    });
  }

  async function approve(): Promise<void> {
    if (!mayApprove.value || !selected.value) {
      return;
    }
    const reference = externalActionApprovalReference(selected.value);
    await run(async () => {
      await props.api(`${props.base}/external-actions/approve`, reference);
      if (!isLive()) {
        return;
      }
      selected.value = undefined;
      confirmed.value = false;
      await load();
      message.value = externalActionApprovedMessage();
    });
  }

  function initialize(): void {
    if (!props.disabled && !initialized && isLive()) {
      initialized = true;
      void run(() => load());
    }
  }

  onMounted(initialize);
  watch(() => props.disabled, initialize, { flush: "post" });

  return {
    consumerDirty,
    preparationDirty,
    rows,
    selected,
    busy,
    error,
    message,
    confirmed,
    cursor,
    now,
    states: externalActionReviewStates,
    mayApprove,
    run,
    load,
    review,
    approve,
  };
}
