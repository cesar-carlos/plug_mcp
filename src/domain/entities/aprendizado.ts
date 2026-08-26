import type { ParametroSkill } from "./skill.js";

export interface ConsultaAprendida {
  readonly id: string;
  readonly agentId: string;
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
  readonly agentId: string;
  readonly termo: string;
  readonly alvoTipo: string;
  readonly alvoId: string;
}

export interface LacunaConsulta {
  readonly id: string;
  readonly agentId: string;
  readonly pergunta: string;
  readonly createdAt: Date;
}
