import type { AnotacaoGrafo, NovaSkill, Skill, StatusSkill } from "../entities/skill.js";

export interface SkillRepositoryPort {
  create(input: NovaSkill): Promise<Skill>;
  update(
    id: string,
    patch: Partial<Pick<Skill, "nome" | "descricao" | "sqlModelo">>,
  ): Promise<Skill>;
  setStatus(id: string, status: StatusSkill, versao?: number): Promise<Skill>;
  findById(id: string): Promise<Skill | null>;
  findBySlug(agentId: string, slug: string): Promise<Skill | null>;
  listByAgent(agentId: string): Promise<readonly Skill[]>;
  buscar(agentId: string, query: string, limite: number): Promise<readonly Skill[]>;
}

export interface AnotacaoGrafoRepositoryPort {
  create(input: {
    agentId: string;
    tabelaId: string | null;
    tipo: string;
    titulo: string;
    texto: string;
    autorUsuarioId: string | null;
  }): Promise<AnotacaoGrafo>;
  list(agentId: string, tabelaId?: string | null): Promise<readonly AnotacaoGrafo[]>;
  findById(id: string): Promise<AnotacaoGrafo | null>;
  deleteById(id: string): Promise<boolean>;
  buscar(agentId: string, query: string, limite: number): Promise<readonly AnotacaoGrafo[]>;
}
