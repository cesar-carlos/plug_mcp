export type OrigemFato = "inferido" | "confirmado_usuario" | "validado_execucao";
export type StatusFato = "vigente" | "conflito";

export interface GrafoDialeto {
  readonly agentId: string;
  readonly dialeto: string;
}

export interface TabelaGrafo {
  readonly id: string;
  readonly agentId: string;
  readonly nome: string;
  readonly descricao: string | null;
  readonly origem: OrigemFato;
  readonly status: StatusFato;
  readonly autorUsuarioId: string | null;
}

export interface ColunaGrafo {
  readonly id: string;
  readonly tabelaId: string;
  readonly nome: string;
  readonly tipo: string | null;
  readonly descricao: string | null;
  readonly dicionario: string | null;
  readonly origem: OrigemFato;
  readonly status: StatusFato;
  readonly autorUsuarioId: string | null;
}

export interface RelacionamentoGrafo {
  readonly id: string;
  readonly agentId: string;
  readonly tabelaOrigemId: string;
  readonly colunaOrigem: string;
  readonly tabelaDestinoId: string;
  readonly colunaDestino: string;
  readonly tipoJoin: string;
  readonly descricao: string | null;
  readonly origem: OrigemFato;
  readonly status: StatusFato;
  readonly autorUsuarioId: string | null;
}

export const origemRank = (origem: OrigemFato): number => {
  if (origem === "validado_execucao") {
    return 3;
  }
  if (origem === "confirmado_usuario") {
    return 2;
  }
  return 1;
};
