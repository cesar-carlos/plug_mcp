import type { EscopoCatalogo } from "./fonte.js";

export const TIPOS_ANOTACAO = ["uso", "codigo", "alerta", "glossario", "preferencia"] as const;

export type TipoAnotacao = (typeof TIPOS_ANOTACAO)[number];

export interface FonteAnotacao {
  readonly id: string;
  readonly mcpAccountId: string;
  readonly agentId: string;
  readonly fonteId: string | null;
  readonly tipo: TipoAnotacao;
  readonly titulo: string;
  readonly texto: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface NovaAnotacaoInput {
  readonly escopo: EscopoCatalogo;
  readonly fonteId: string | null;
  readonly tipo: TipoAnotacao;
  readonly titulo: string;
  readonly texto: string;
}

export const MAX_ANOTACOES_POR_FONTE = 50;
export const MAX_TEXTO_ANOTACAO = 1_000;
export const MAX_TITULO_ANOTACAO = 120;
export const LISTAR_ANOTACOES_DEFAULT_LIMIT = 50;
export const LISTAR_ANOTACOES_MAX_LIMIT = 200;
