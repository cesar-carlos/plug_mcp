import type { OperationState } from "../../../src/domain/persona-v2/operation";
import type { OperationRetention } from "../../../src/domain/persona-v2/operation-retention";

export type OperationKind = "sql" | "external";
export interface OperationReference {
  operationId: string;
  fingerprint: string;
}
export interface ConsumerOperationView extends OperationReference {
  state: OperationState;
  expiresAt: string;
  requireHumanApproval: boolean;
  receipt?: unknown;
  reconciliation?: unknown;
  retention?: OperationRetention;
  data?: unknown;
  dataAvailability?: string;
}
export const operationStates: Record<OperationState, string> = {
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
type Action = "refresh" | "execute" | "cancel" | "reconcile";
interface Context {
  personaId: string;
  bearer: string;
  kind: OperationKind;
  reference: OperationReference;
}
type Call = <T>(tool: string, args: unknown) => Promise<T>;
const tools = {
  sql: {
    refresh: "obter_operacao",
    execute: "executar_operacao",
    cancel: "cancelar_operacao",
    reconcile: "conciliar_operacao",
  },
  external: {
    refresh: "obter_acao_externa",
    execute: "executar_acao_externa",
    cancel: "cancelar_acao_externa",
    reconcile: "conciliar_acao_externa",
  },
};

/** UI state only; the server reauthorizes every request and owns the durable journal. */
export class ConsumerOperationSession {
  view: ConsumerOperationView | undefined;
  busy = false;
  error = "";
  message = "";
  private generation = 0;
  private readonly dispatched = new Set<string>();

  constructor(
    private readonly call: Call,
    private readonly context: () => Context,
    private readonly now: () => number = Date.now,
  ) {}

  invalidate(): void {
    this.generation++;
    this.view = undefined;
    this.error = "";
    this.message = "";
  }
  private key(): string {
    const c = this.context();
    return `${c.kind}:${c.reference.operationId}:${c.reference.fingerprint}`;
  }
  get attempted(): boolean {
    return this.dispatched.has(this.key());
  }
  mayExecute(view = this.view): boolean {
    return (
      !!view &&
      !this.attempted &&
      Date.parse(view.expiresAt) > this.now() &&
      (view.state === "aprovada" || (view.state === "preparada" && !view.requireHumanApproval))
    );
  }
  mayCancel(view = this.view): boolean {
    return (
      !!view &&
      (["preparada", "aprovada", "aprovacao_pendente"].includes(view.state) ||
        (this.context().kind === "sql" && view.state === "executando"))
    );
  }
  private read(raw: unknown, reference: OperationReference): ConsumerOperationView {
    if (!raw || typeof raw !== "object") {
      throw new Error("Resposta de operação inválida.");
    }
    const value = raw as ConsumerOperationView;
    if (
      value.operationId !== reference.operationId ||
      value.fingerprint !== reference.fingerprint ||
      !Object.hasOwn(operationStates, value.state) ||
      !Number.isFinite(Date.parse(value.expiresAt)) ||
      typeof value.requireHumanApproval !== "boolean"
    ) {
      throw new Error("A resposta não corresponde ao conteúdo selecionado.");
    }
    return value;
  }
  async run(action: Action, confirmed = false): Promise<void> {
    if (this.busy) {
      return;
    }
    if (action !== "refresh" && !this.view) {
      this.error = "Verifique o estado com este token antes de agir.";
      return;
    }
    if ((action === "execute" || action === "cancel") && !confirmed) {
      this.error = "Confirme a ação sobre o conteúdo selecionado.";
      return;
    }
    const c = this.context(),
      reference = { operationId: c.reference.operationId, fingerprint: c.reference.fingerprint },
      generation = ++this.generation;
    const current = () =>
      generation === this.generation &&
      this.context().bearer === c.bearer &&
      this.context().personaId === c.personaId &&
      this.key() === `${c.kind}:${reference.operationId}:${reference.fingerprint}`;
    if (!c.bearer) {
      this.invalidate();
      this.error = "Informe o token do consumidor.";
      return;
    }
    this.busy = true;
    this.error = "";
    this.message = "";
    this.view = undefined;
    try {
      const persona = await this.call<{ id: string }>("obter_contexto_persona", {});
      if (!current()) {
        return;
      }
      if (persona.id !== c.personaId) {
        throw new Error("Este token pertence a outra persona.");
      }
      const view = this.read(await this.call(tools[c.kind].refresh, reference), reference);
      if (!current()) {
        return;
      }
      if (action === "refresh") {
        this.view = view;
        this.message = "Estado conferido com o token. A autorização será revalidada em cada ação.";
        return;
      }
      if (action === "execute" && !this.mayExecute(view)) {
        throw new Error(
          "Execução indisponível. Confira aprovação, validade e estado; não reenvie uma operação incerta.",
        );
      }
      if (action === "cancel" && !this.mayCancel(view)) {
        throw new Error("Este estado não permite solicitar cancelamento.");
      }
      if (action === "reconcile" && view.state !== "resultado_desconhecido") {
        throw new Error("Conciliação exige resultado desconhecido e procedimento publicado.");
      }
      if (action === "execute") {
        this.dispatched.add(this.key());
      }
      const result = await this.call(tools[c.kind][action], reference);
      if (!current()) {
        return;
      }
      const updated =
        action === "reconcile" && c.kind === "external"
          ? await this.call(tools.external.refresh, reference)
          : result;
      if (!current()) {
        return;
      }
      this.view = this.read(updated, reference);
      this.message =
        action === "reconcile"
          ? "Evidência consultada. Conciliação não autoriza reenviar nem altera o comprovante técnico."
          : action === "cancel"
            ? "Estado registrado após o pedido. Cancelamento solicitado não confirma rollback."
            : "Solicitação de execução concluída. Consulte o estado e o comprovante apresentados.";
    } catch (cause) {
      if (current()) {
        this.view = undefined;
        this.error =
          action === "execute" && this.attempted
            ? "Não foi possível confirmar a execução. Verifique o estado e as permissões; não reenvie esta preparação."
            : cause instanceof Error
              ? cause.message
              : "Operação indisponível.";
      }
    } finally {
      this.busy = false;
    }
  }
}
