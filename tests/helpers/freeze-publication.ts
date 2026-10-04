import { randomUUID } from "node:crypto";
import type { Skill } from "../../src/domain/entities/skill.js";
import type { GrafoRepositoryPort } from "../../src/domain/ports/grafo-repository.port.js";
import type {
  AnotacaoGrafoRepositoryPort,
  SkillRepositoryPort,
} from "../../src/domain/ports/skill-repository.port.js";
import { capturarConhecimentoPublicavel } from "../../src/application/use-cases/shared/conhecimento-publicado.js";
export const freezeFixturePublication = async (
  skills: SkillRepositoryPort,
  skill: Skill,
  grafo: GrafoRepositoryPort,
  notas?: AnotacaoGrafoRepositoryPort,
): Promise<void> => {
  const conhecimentoPublicado = await capturarConhecimentoPublicavel(
    grafo,
    notas,
    skill.acessoId!,
    skill,
  );
  await skills.ativarPublicacao!(skill.id, randomUUID(), randomUUID(), {
    ...skill,
    conhecimentoPublicado,
  });
};
