import type { Dialeto } from "./dialeto.js";

export interface Fonte {
  readonly id: string;
  readonly slug: string;
  readonly nome: string;
  readonly descricao: string;
  readonly ativo: boolean;
  readonly mcpAccountId: string | null;
  readonly agentId: string | null;
}

export interface FonteSqlVariant {
  readonly id: string;
  readonly fonteId: string;
  readonly dialeto: Dialeto;
  readonly sqlBase: string;
  readonly observacoesDialeto: string;
}

export interface FonteColuna {
  readonly id: string;
  readonly fonteId: string;
  readonly nome: string;
  readonly tipo: string;
  readonly descricao: string;
  readonly regraNegocio: string | null;
  readonly ordem: number;
}

export type DestinoRelacionamento =
  | { readonly tipo: "fonte"; readonly id: string; readonly slug: string }
  | { readonly tipo: "tabela"; readonly nome: string };

export interface FonteRelacionamento {
  readonly id: string;
  readonly fonteOrigemId: string;
  readonly colunaOrigem: string;
  readonly destino: DestinoRelacionamento;
  readonly colunaDestino: string;
  readonly tipoJoin: string;
  readonly descricao: string;
}

export interface RegraNegocio {
  readonly id: string;
  readonly fonteId: string | null;
  readonly nome: string;
  readonly descricao: string;
  readonly expressao: string | null;
}

export interface Sinonimo {
  readonly id: string;
  readonly fonteId: string;
  readonly termo: string;
  readonly descricao: string;
}

export interface FonteDetalhe {
  readonly fonte: Fonte;
  readonly dialeto: Dialeto;
  readonly sqlBase: string;
  readonly observacoesDialeto: string;
  readonly colunas: readonly FonteColuna[];
  readonly relacionamentos: readonly FonteRelacionamento[];
  readonly regras: readonly RegraNegocio[];
  readonly sinonimos: readonly Sinonimo[];
  readonly orientacoesIa: readonly string[];
}

export interface EscopoCatalogo {
  readonly mcpAccountId: string;
  readonly agentId: string;
}

export interface NovaFonteColunaInput {
  readonly nome: string;
  readonly tipo: string;
  readonly descricao: string;
  readonly regraNegocio: string | null;
  readonly ordem: number;
}

export interface NovaFonteRegraInput {
  readonly nome: string;
  readonly descricao: string;
  readonly expressao: string | null;
}

export interface NovaFonteSinonimoInput {
  readonly termo: string;
  readonly descricao: string;
}

export type NovaFonteRelacionamentoInput = {
  readonly colunaOrigem: string;
  readonly colunaDestino: string;
  readonly tipoJoin: string;
  readonly descricao: string;
} & (
  | {
      readonly destino: {
        readonly tipo: "fonte";
        readonly fonteDestinoId: string;
        readonly fonteDestinoSlug: string;
      };
    }
  | { readonly destino: { readonly tipo: "tabela"; readonly tabelaDestino: string } }
);

export interface NovaFonteInput {
  readonly escopo: EscopoCatalogo;
  readonly slug: string;
  readonly nome: string;
  readonly descricao: string;
  readonly dialeto: Dialeto;
  readonly sqlBase: string;
  readonly observacoesDialeto: string;
  readonly colunas: readonly NovaFonteColunaInput[];
  readonly regras: readonly NovaFonteRegraInput[];
  readonly sinonimos: readonly NovaFonteSinonimoInput[];
  readonly relacionamentos: readonly NovaFonteRelacionamentoInput[];
}

export const origemFonte = (fonte: Fonte): "seed" | "minha" =>
  fonte.mcpAccountId === null ? "seed" : "minha";

export const escolherFonteComPrecedencia = (candidatas: readonly Fonte[]): Fonte | null => {
  const propria = candidatas.find((fonte) => fonte.mcpAccountId !== null);
  if (propria) {
    return propria;
  }
  return candidatas.find((fonte) => fonte.mcpAccountId === null) ?? null;
};

export const dedupeFontesComPrecedencia = (fontes: readonly Fonte[]): Fonte[] => {
  const bySlug = new Map<string, Fonte>();
  for (const fonte of fontes) {
    const atual = bySlug.get(fonte.slug);
    if (!atual || (fonte.mcpAccountId !== null && atual.mcpAccountId === null)) {
      bySlug.set(fonte.slug, fonte);
    }
  }
  return [...bySlug.values()];
};
