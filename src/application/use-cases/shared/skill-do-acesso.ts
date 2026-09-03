import type { Skill } from "../../../domain/entities/skill.js";
import { DomainError } from "../../../domain/errors/domain-error.js";
import { ERROR_CODES } from "../../../domain/errors/error-codes.js";
import type { SkillRepositoryPort } from "../../../domain/ports/skill-repository.port.js";

export const requireSkillDoAcesso = async (
  skills: SkillRepositoryPort | undefined,
  skillId: string,
  acessoId: string,
): Promise<Skill> => {
  const skill = skills ? await skills.findById(skillId) : null;
  if (skill?.acessoId !== acessoId) {
    throw new DomainError({
      code: ERROR_CODES.SKILL_NOT_FOUND,
      message: "Skill não encontrada neste acesso.",
      hint: "Use listar_skills / obter_skill.",
    });
  }
  return skill;
};
