export type TipoConhecimento =
  "skill" | "regra" | "glossario" | "metrica" | "consulta_aprendida" | "tabela" | "uso";

export interface HitConhecimento {
  readonly tipo: TipoConhecimento;
  readonly id: string;
  readonly titulo: string;
  readonly trecho: string;
  readonly fonte: string;
  readonly skillId: string | null;
  readonly tabelaId: string | null;
  readonly score: number;
}

export const CONHECIMENTOS_TETO = 8;

export const TRECHO_CONHECIMENTO_MAX = 400;

export const truncarTrechoConhecimento = (texto: string): string => {
  const trimmed = texto.trim();
  if (trimmed.length <= TRECHO_CONHECIMENTO_MAX) {
    return trimmed;
  }
  return `${trimmed.slice(0, TRECHO_CONHECIMENTO_MAX)}…`;
};

export const tipoConhecimentoDeAnotacao = (tipo: string): TipoConhecimento => {
  if (tipo === "regra" || tipo === "glossario" || tipo === "metrica" || tipo === "uso") {
    return tipo;
  }
  return "uso";
};
