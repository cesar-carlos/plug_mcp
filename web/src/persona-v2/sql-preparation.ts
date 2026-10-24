import type { OperationTraining } from "../../../src/domain/persona-v2/operation-training";
import type { ConsumerOperationView } from "./consumer-operation";
export interface GrantedSqlOperation {
  skillId: string;
  publicationId: string;
  hash: string;
  name: string;
  training: OperationTraining;
}
type Call = <T>(tool: string, args: unknown) => Promise<T>;
interface Context {
  personaId: string;
  bearer: string;
}
export class SqlPreparationSession {
  choices: GrantedSqlOperation[] = [];
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
  async run(selected?: GrantedSqlOperation, input?: unknown): Promise<void> {
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
        const summaries = await this.call<
          { id: string; slug: string; kind: string; publicationId: string; hash: string }[]
        >("listar_skills", {});
        const rows: GrantedSqlOperation[] = [];
        for (const summary of summaries.filter((row) => row.kind === "operacao_sql")) {
          if (!current()) return;
          const row = await this.call<GrantedSqlOperation & { id: string; format: string }>(
            "obter_skill",
            { slug: summary.slug },
          );
          if (!current()) return;
          if (
            row.format !== "persona-sql-operation-v2" ||
            row.id !== summary.id ||
            row.publicationId !== summary.publicationId ||
            row.hash !== summary.hash
          )
            throw new Error("Publicação mudou durante a leitura.");
          rows.push({ ...row, skillId: row.id });
        }
        if (current()) {
          this.choices = rows;
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
        throw new Error("Carregue novamente as operações concedidas.");
      this.attempted = true;
      sent = true;
      const result = await this.call<ConsumerOperationView & { publicationId: string }>(
        "preparar_operacao",
        {
          publicationId: selected.publicationId,
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
