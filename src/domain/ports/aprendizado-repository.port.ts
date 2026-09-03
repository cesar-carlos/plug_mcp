import type {
  ConsultaAprendida,
  LacunaConsulta,
  Sinonimo,
  StatusLacuna,
  TipoLacuna,
} from "../entities/aprendizado.js";
import type { HitBusca } from "../entities/hit-busca.js";
import type { ParametroSkill } from "../entities/skill.js";

export interface AprendizadoRepositoryPort {
  salvarConsulta(input: {
    acessoId: string;
    skillIds: readonly string[];
    pergunta: string;
    sql: string;
    paramsContrato: readonly ParametroSkill[];
    autorUsuarioId: string | null;
  }): Promise<ConsultaAprendida>;
  listarConsultas(acessoId: string, limite: number): Promise<readonly ConsultaAprendida[]>;
  listarConsultasDaSkill(
    acessoId: string,
    skillId: string,
    limite: number,
  ): Promise<readonly ConsultaAprendida[]>;
  obterConsulta(acessoId: string, id: string): Promise<ConsultaAprendida | null>;
  buscarConsultas(
    acessoId: string,
    query: string,
    limite: number,
  ): Promise<readonly HitBusca<ConsultaAprendida>[]>;
  registrarSinonimo(input: {
    acessoId: string;
    termo: string;
    alvoTipo: string;
    alvoId: string;
  }): Promise<Sinonimo>;
  listarSinonimos(acessoId: string): Promise<readonly Sinonimo[]>;
  desvincularSkill(
    acessoId: string,
    skillId: string,
  ): Promise<{ consultas: number; sinonimos: number }>;
  registrarLacuna(
    acessoId: string,
    pergunta: string,
    tipo?: TipoLacuna,
    contrato?: Record<string, unknown> | null,
  ): Promise<LacunaConsulta>;
  arquivarLacunaSkillGap(acessoId: string, pergunta: string): Promise<number>;
  listarLacunas(
    acessoId: string,
    limite: number,
    status?: StatusLacuna,
  ): Promise<readonly LacunaConsulta[]>;
  deleteByAcesso(acessoId: string): Promise<void>;
}
