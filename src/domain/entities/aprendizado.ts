import type { ParametroSkill } from "./skill.js";

export interface ConsultaAprendida {
  readonly id: string;
  readonly acessoId: string | null;
  readonly skillIds: readonly string[];
  readonly pergunta: string;
  readonly sql: string;
  readonly paramsContrato: readonly ParametroSkill[];
  readonly execucoes: number;
  readonly ultimaExecucao: Date;
  readonly status: string;
  readonly autorUsuarioId: string | null;
}

export interface Sinonimo {
  readonly id: string;
  readonly acessoId: string | null;
  readonly termo: string;
  readonly alvoTipo: string;
  readonly alvoId: string;
}

export type TipoLacuna = "skill_gap" | "ferramenta";
export type StatusLacuna = "aberta" | "arquivada";

export const chavePerguntaLacuna = (pergunta: string): string =>
  pergunta.trim().toLowerCase().replace(/\s+/g, " ");

export interface LacunaConsulta {
  readonly id: string;
  readonly acessoId: string | null;
  readonly pergunta: string;
  readonly tipo: TipoLacuna;
  readonly status: StatusLacuna;
  readonly contrato: Record<string, unknown> | null;
  readonly createdAt: Date;
}
