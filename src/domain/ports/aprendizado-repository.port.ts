import type { ConsultaAprendida, LacunaConsulta, Sinonimo } from "../entities/aprendizado.js";
import type { ParametroSkill } from "../entities/skill.js";

export interface AprendizadoRepositoryPort {
  salvarConsulta(input: {
    agentId: string;
    skillId: string | null;
    pergunta: string;
    sql: string;
    paramsContrato: readonly ParametroSkill[];
    autorUsuarioId: string | null;
  }): Promise<ConsultaAprendida>;
  listarConsultas(agentId: string, limite: number): Promise<readonly ConsultaAprendida[]>;
  buscarConsultas(
    agentId: string,
    query: string,
    limite: number,
  ): Promise<readonly ConsultaAprendida[]>;
  registrarSinonimo(input: {
    agentId: string;
    termo: string;
    alvoTipo: string;
    alvoId: string;
  }): Promise<Sinonimo>;
  listarSinonimos(agentId: string): Promise<readonly Sinonimo[]>;
  desvincularSkill(
    agentId: string,
    skillId: string,
  ): Promise<{ consultas: number; sinonimos: number }>;
  registrarLacuna(agentId: string, pergunta: string): Promise<LacunaConsulta>;
}
