import type { HitBusca } from "../entities/hit-busca.js";
import type { AnotacaoGrafo, NovaSkill, Skill, StatusSkill } from "../entities/skill.js";

export interface SkillRepositoryPort {
  create(input: NovaSkill): Promise<Skill>;
  update(
    id: string,
    patch: Partial<
      Pick<
        Skill,
        | "nome"
        | "descricao"
        | "sqlModelo"
        | "params"
        | "status"
        | "escopo"
        | "pacoteVersao"
        | "motivoRevalidacao"
        | "consultaSemantica"
        | "politicaConsulta"
        | "slug"
      >
    >,
  ): Promise<Skill>;
  setStatus(id: string, status: StatusSkill, versao?: number): Promise<Skill>;
  findById(id: string): Promise<Skill | null>;
  findBySlug(agentId: string, slug: string): Promise<Skill | null>;
  listByAgent(agentId: string): Promise<readonly Skill[]>;
  deleteById(id: string): Promise<boolean>;
  buscar(
    agentId: string,
    query: string,
    limite: number,
    status?: StatusSkill | readonly StatusSkill[],
  ): Promise<readonly HitBusca<Skill>[]>;
}

export interface AnotacaoGrafoRepositoryPort {
  create(input: {
    agentId: string;
    tabelaId: string | null;
    skillId?: string | null;
    tipo: string;
    titulo: string;
    texto: string;
    autorUsuarioId: string | null;
  }): Promise<AnotacaoGrafo>;
  list(
    agentId: string,
    tabelaId?: string | null,
    skillId?: string | null,
  ): Promise<readonly AnotacaoGrafo[]>;
  findById(id: string): Promise<AnotacaoGrafo | null>;
  deleteById(id: string): Promise<boolean>;
  buscar(
    agentId: string,
    query: string,
    limite: number,
  ): Promise<readonly HitBusca<AnotacaoGrafo>[]>;
}
