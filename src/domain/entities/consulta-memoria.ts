import type { EscopoCatalogo } from "./fonte.js";

export interface ConsultaMemoria {
  readonly id: string;
  readonly mcpAccountId: string;
  readonly agentId: string;
  readonly pergunta: string;
  readonly sqlExecutado: string;
  readonly fonteSlug: string | null;
  readonly observacao: string;
  readonly aprovadoEm: Date;
}

export interface NovaConsultaMemoriaInput {
  readonly escopo: EscopoCatalogo;
  readonly pergunta: string;
  readonly sqlExecutado: string;
  readonly fonteSlug: string | null;
  readonly observacao: string;
}

export const MAX_PERGUNTA_MEMORIA = 500;
export const MAX_OBSERVACAO_MEMORIA = 1_000;
