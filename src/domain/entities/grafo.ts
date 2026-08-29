import type { Cardinalidade, PapelColuna, PerfilColuna } from "./escopo.js";
import type { ParRelacionamento } from "./relacionamento.js";
import type { SensibilidadeColuna } from "./privacidade.js";

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
  readonly nullable: boolean | null;
  readonly descricao: string | null;
  readonly dicionario: string | null;
  readonly papel: PapelColuna | null;
  readonly formato: string | null;
  readonly perfil: PerfilColuna | null;
  readonly sensibilidade: SensibilidadeColuna;
  readonly origem: OrigemFato;
  readonly status: StatusFato;
  readonly autorUsuarioId: string | null;
}

export interface EscopoValidacaoRel {
  readonly empresa?: string;
  readonly filial?: string;
}

export interface RelacionamentoGrafo {
  readonly id: string;
  readonly agentId: string;
  readonly tabelaOrigemId: string;
  readonly colunaOrigem: string;
  readonly tabelaDestinoId: string;
  readonly colunaDestino: string;
  readonly pares: readonly ParRelacionamento[];
  readonly paresFingerprint: string;
  readonly tipoJoin: string;
  readonly cardinalidade: Cardinalidade | null;
  readonly descricao: string | null;
  readonly escopoValidacao: EscopoValidacaoRel | null;
  readonly origem: OrigemFato;
  readonly status: StatusFato;
  readonly autorUsuarioId: string | null;
}

export interface SchemaSnapshotGrafo {
  readonly agentId: string;
  readonly tabelaNome: string;
  readonly assinatura: string;
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
