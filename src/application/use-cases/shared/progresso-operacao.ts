export interface ProgressoOperacao {
  readonly operacaoId: string;
  readonly tool: string;
  readonly fase: string;
  readonly queriesUsadas: number;
  readonly queriesLimite: number;
  readonly cancelado: boolean;
}

export class RegistroOperacoes {
  private readonly ops = new Map<
    string,
    { usuarioId: string; abort: AbortController; estado: ProgressoOperacao }
  >();

  iniciar(
    usuarioId: string,
    tool: string,
    queriesLimite: number,
  ): {
    operacaoId: string;
    signal: AbortSignal;
    report: (fase: string, queriesUsadas: number) => ProgressoOperacao;
  } {
    const operacaoId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const abort = new AbortController();
    const estado: ProgressoOperacao = {
      operacaoId,
      tool,
      fase: "inicio",
      queriesUsadas: 0,
      queriesLimite,
      cancelado: false,
    };
    this.ops.set(operacaoId, { usuarioId, abort, estado });
    return {
      operacaoId,
      signal: abort.signal,
      report: (fase, queriesUsadas) => {
        const current = this.ops.get(operacaoId);
        if (!current) {
          return estado;
        }
        current.estado = { ...current.estado, fase, queriesUsadas };
        return current.estado;
      },
    };
  }

  cancelar(usuarioId: string, operacaoId: string): boolean {
    const current = this.ops.get(operacaoId);
    if (current?.usuarioId !== usuarioId) {
      return false;
    }
    current.estado = { ...current.estado, cancelado: true, fase: "cancelado" };
    current.abort.abort();
    return true;
  }

  obter(usuarioId: string, operacaoId: string): ProgressoOperacao | null {
    const current = this.ops.get(operacaoId);
    if (current?.usuarioId !== usuarioId) {
      return null;
    }
    return current.estado;
  }

  finalizar(operacaoId: string): void {
    this.ops.delete(operacaoId);
  }
}

export const registroOperacoesGlobal = new RegistroOperacoes();
