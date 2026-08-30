import type { StatusSkill } from "./skill.js";

export type TipoConhecimento =
  "skill" | "regra" | "glossario" | "metrica" | "consulta_aprendida" | "tabela" | "uso";

export interface SkillResumoContexto {
  readonly id: string;
  readonly slug: string;
  readonly nome: string;
  readonly status: StatusSkill;
}

export interface ConsultaAprendidaResumo {
  readonly id: string;
  readonly pergunta: string;
  readonly skillIds: readonly string[];
  readonly execucoes: number;
  readonly status: string;
}

export const TIPOS_NARRATIVA_COM_SKILL: ReadonlySet<TipoConhecimento> = new Set([
  "regra",
  "glossario",
  "metrica",
]);

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
