import type { Skill } from "../../../domain/entities/skill.js";
import type { SkillRepositoryPort } from "../../../domain/ports/skill-repository.port.js";
import { escopoFromSqlModelo } from "./escopo-from-modelo.js";
import { parseSqlModelo } from "./sql-modelo.js";

/** Grava o escopo derivado do sqlModelo quando a skill ainda tem JSON vazio (skills pré-0011). */
export const persistirEscopoSeVazio = async (
  skills: SkillRepositoryPort,
  skill: Skill,
): Promise<Skill> => {
  if (skill.escopo.tabelas.length > 0) {
    return skill;
  }
  const escopo = escopoFromSqlModelo(parseSqlModelo(skill.sqlModelo));
  if (escopo.tabelas.length === 0) {
    return skill;
  }
  return skills.update(skill.id, { escopo });
};
