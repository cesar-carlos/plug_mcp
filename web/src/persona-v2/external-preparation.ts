import type { ExternalContract } from "../../../src/domain/persona-v2/external-contract";
import type { ConsumerOperationView } from "./consumer-operation";
export interface GrantedExternalAction {
  skillId: string;
  publicationId: string;
  hash: string;
  name: string;
  contract: ExternalContract;
}
type Call = <T>(tool: string, args: unknown) => Promise<T>;
interface Context {
  personaId: string;
  bearer: string;
}
export class ExternalPreparationSession {
  choices: GrantedExternalAction[] = [];
  result: ConsumerOperationView | undefined;
  error = "";
  busy = false;
  loaded = false;
  attempted = false;
  private epoch = 0;
  constructor(
    private readonly call: Call,
    private readonly context: () => Context,
  ) {}
  invalidate(): void {
    this.epoch++;
    this.choices = [];
    this.loaded = false;
    this.result = undefined;
    this.error = "";
    this.attempted = false;
  }
  async run(
    selected?: GrantedExternalAction,
    input?: Record<string, string | number | boolean>,
  ): Promise<void> {
    if (this.busy || (selected && this.attempted)) return;
    const context = { ...this.context() },
      epoch = this.epoch;
    const current = () =>
      epoch === this.epoch &&
      this.context().personaId === context.personaId &&
      this.context().bearer === context.bearer;
    this.error = "";
    if (!context.bearer) {
      this.error = "Informe o token do consumidor.";
      return;
    }
    this.busy = true;
    let sent = false;
    try {
      const persona = await this.call<{ id: string }>("obter_contexto_persona", {});
      if (!current()) return;
      if (persona.id !== context.personaId) throw new Error("Token de outra persona.");
      if (!selected) {
        const rows = await this.call<GrantedExternalAction[]>("listar_operacoes_externas", {});
        if (current()) {
          this.choices = rows.filter((row) => row.contract.effect === "acao");
          this.loaded = true;
        }
        return;
      }
      if (
        !this.choices.some(
          (row) =>
            row.skillId === selected.skillId &&
            row.publicationId === selected.publicationId &&
            row.hash === selected.hash,
        )
      )
        throw new Error("Carregue novamente as ações concedidas.");
      this.attempted = true;
      sent = true;
      const result = await this.call<ConsumerOperationView & { publicationId: string }>(
        "preparar_acao_externa",
        {
          skillId: selected.skillId,
          expectedPublicationId: selected.publicationId,
          input: input ?? {},
        },
      );
      if (!current()) return;
      if (
        result.publicationId !== selected.publicationId ||
        !/^[a-f0-9]{64}$/.test(result.fingerprint) ||
        !result.operationId ||
        !Number.isFinite(Date.parse(result.expiresAt)) ||
        typeof result.requireHumanApproval !== "boolean" ||
        !["preparada", "aprovacao_pendente"].includes(result.state)
      )
        throw new Error("Preparação incompatível.");
      this.result = result;
    } catch {
      if (current())
        this.error = sent
          ? "Não foi possível confirmar a preparação. Confira a lista administrativa antes de iniciar outra; esta tentativa não será reenviada."
          : "Não foi possível confirmar a persona e as permissões deste token.";
    } finally {
      this.busy = false;
    }
  }
}
