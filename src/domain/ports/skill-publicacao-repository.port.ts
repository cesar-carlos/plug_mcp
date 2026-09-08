import type { PoliticaConsulta } from "../entities/politica-consulta.js";
import type { Skill } from "../entities/skill.js";

export interface SkillPublicacao {
  readonly id: string;
  readonly acessoId: string;
  readonly skillId: string;
  readonly publicacaoVersao: number;
  readonly skillVersao: number;
  readonly pacote: Readonly<Record<string, unknown>>;
  readonly pacoteHash: string;
  readonly origem: "publicacao" | "migracao";
  readonly autorUsuarioId: string | null;
  readonly createdAt: Date;
}

export interface SkillPublicacaoRepositoryPort {
  latest(acessoId: string, skillId: string): Promise<SkillPublicacao | null>;
  publishAtomically(input: {
    acessoId: string;
    skillId: string;
    expectedSkillVersion: number;
    pacote: Readonly<Record<string, unknown>>;
    pacoteHash: string;
    politicaConsulta: PoliticaConsulta;
    autorUsuarioId: string | null;
  }): Promise<{ skill: Skill; publicacao: SkillPublicacao }>;
}
