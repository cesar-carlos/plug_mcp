import { computed, onBeforeUnmount, onMounted, ref, watch, type ComputedRef, type Ref } from "vue";
import type {
  OperationReconciliation,
  OperationReceipt,
  OperationState,
  SqlOperationCommand,
} from "../../../src/domain/persona-v2/operation";
import type { OperationRetention } from "../../../src/domain/persona-v2/operation-retention";
import { usePanelRun } from "./use-panel-run";

export interface OperationReviewRow {
  operationId: string;
  publicationId: string;
  sourceId: string;
  fingerprint: string;
  state: OperationState;
  expiresAt: string;
  version: number;
  requireHumanApproval: boolean;
  receipt: OperationReceipt | null;
  reconciliation: OperationReconciliation | null;
  retention?: OperationRetention;
}

export interface OperationReviewDetail extends OperationReviewRow {
  command: SqlOperationCommand | null;
}

export interface OperationReviewProps {
  api: <T>(url: string, body?: unknown) => Promise<T>;
  base: string;
  disabled: boolean;
  confirmDiscard: () => Promise<boolean>;
}

export interface OperationReviewEmit {
  (event: "lock", value: boolean): void;
  (event: "dirty", value: boolean): void;
}

export interface OperationReviewState {
  consumerDirty: Ref<boolean>;
  preparationDirty: Ref<boolean>;
  rows: Ref<OperationReviewRow[]>;
  cursor: Ref<string | null>;
  selected: Ref<OperationReviewDetail | undefined>;
  busy: Ref<boolean>;
  error: Ref<string>;
  message: Ref<string>;
  confirmed: Ref<boolean>;
  now: Ref<number>;
  filter: Ref<string>;
  states: Record<OperationState, string>;
  visibleRows: ComputedRef<OperationReviewRow[]>;
  mayApprove: ComputedRef<boolean>;
  run: (action: () => Promise<void>) => Promise<void>;
  load: (more?: boolean) => Promise<void>;
  review: (id: string) => Promise<void>;
  approve: () => Promise<void>;
}

export const operationReviewStates: Record<OperationState, string> = {
  preparada: "Preparada",
  aprovacao_pendente: "Aprovação pendente",
  aprovada: "Aprovada",
  executando: "Em execução",
  concluida: "Concluída",
  recusada: "Recusada",
  expirada: "Expirada",
  rollback_confirmado: "Rollback confirmado",
  cancelamento_solicitado: "Cancelamento solicitado",
  cancelada: "Cancelada",
  resultado_desconhecido: "Resultado desconhecido",
};

export function filterOperationRows(
  rows: readonly OperationReviewRow[],
  filter: string,
): OperationReviewRow[] {
  return rows.filter((row) => !filter || row.state === filter);
}

export function operationReviewDirty(
  confirmed: boolean,
  consumerDirty: boolean,
  preparationDirty: boolean,
): boolean {
  return confirmed || consumerDirty || preparationDirty;
}

export function operationReviewNeedsDiscard(confirmed: boolean, consumerDirty: boolean): boolean {
  return confirmed || consumerDirty;
}

export function mayApproveSqlOperation(input: {
  command: SqlOperationCommand | null | undefined;
  state: OperationState | undefined;
  expiresAt: string | undefined;
  confirmed: boolean;
  now: number;
}): boolean {
  return (
    !!input.command &&
    input.state === "aprovacao_pendente" &&
    !!input.expiresAt &&
    Date.parse(input.expiresAt) > input.now &&
    input.confirmed
  );
}

export function operationApprovalReference(operation: {
  readonly operationId: string;
  readonly fingerprint: string;
}): { operationId: string; fingerprint: string } {
  return { operationId: operation.operationId, fingerprint: operation.fingerprint };
}

export function operationListUrl(base: string, more: boolean, cursor: string | null): string {
  return `${base}/operations${more && cursor ? `?after=${encodeURIComponent(cursor)}` : ""}`;
}

export function sqlOperationApprovedMessage(operationId: string): string {
  return `Operação ${operationId} aprovada. A execução continua dependendo do token solicitante e das permissões vigentes.`;
}

export function useOperationReview(
  props: OperationReviewProps,
  emit: OperationReviewEmit,
): OperationReviewState {
  const consumerDirty = ref(false);
  const preparationDirty = ref(false);
  const rows = ref<OperationReviewRow[]>([]);
  const cursor = ref<string | null>(null);
  const selected = ref<OperationReviewDetail>();
  const confirmed = ref(false);
  const now = ref(Date.now());
  const filter = ref("");
  const { busy, error, message, isLive, run } = usePanelRun(
    { disabled: () => props.disabled, fallbackError: "Operação indisponível." },
    emit,
  );
  watch([confirmed, consumerDirty, preparationDirty], () => {
    emit(
      "dirty",
      operationReviewDirty(confirmed.value, consumerDirty.value, preparationDirty.value),
    );
  });
  const visibleRows = computed(() => filterOperationRows(rows.value, filter.value));
  const mayApprove = computed(() =>
    mayApproveSqlOperation({
      command: selected.value?.command,
      state: selected.value?.state,
      expiresAt: selected.value?.expiresAt,
      confirmed: confirmed.value,
      now: now.value,
    }),
  );
  const timer = window.setInterval(() => {
    now.value = Date.now();
  }, 1000);

  onBeforeUnmount(() => {
    selected.value = undefined;
    window.clearInterval(timer);
    emit("dirty", false);
  });

  async function load(more = false): Promise<void> {
    const result = await props.api<{ operations: OperationReviewRow[]; nextCursor: string | null }>(
      operationListUrl(props.base, more, cursor.value),
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
      operationReviewNeedsDiscard(confirmed.value, consumerDirty.value) &&
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
      const result = await props.api<OperationReviewDetail>(`${props.base}/operations/${id}`);
      if (isLive()) {
        selected.value = result;
      }
    });
  }

  async function approve(): Promise<void> {
    if (!mayApprove.value || !selected.value) {
      return;
    }
    const reference = operationApprovalReference(selected.value);
    await run(async () => {
      const result = await props.api<OperationReviewRow>(
        `${props.base}/operations/approve`,
        reference,
      );
      if (!isLive()) {
        return;
      }
      selected.value = undefined;
      confirmed.value = false;
      await load();
      message.value = sqlOperationApprovedMessage(result.operationId);
    });
  }

  onMounted(() => {
    void run(() => load());
  });

  return {
    consumerDirty,
    preparationDirty,
    rows,
    cursor,
    selected,
    busy,
    error,
    message,
    confirmed,
    now,
    filter,
    states: operationReviewStates,
    visibleRows,
    mayApprove,
    run,
    load,
    review,
    approve,
  };
}
