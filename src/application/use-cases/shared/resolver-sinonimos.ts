import type { Sinonimo } from "../../../domain/entities/aprendizado.js";
import type { Skill } from "../../../domain/entities/skill.js";

export const termoSinonimoNaQuery = (query: string, termo: string): boolean => {
  const t = termo.trim().toLowerCase();
  return t.length > 0 && query.toLowerCase().includes(t);
};

export const resolverSkillsPorSinonimos = (
  query: string,
  sinonimos: readonly Sinonimo[],
  skills: readonly Skill[],
): Skill[] => {
  const matched = sinonimos.filter((item) => termoSinonimoNaQuery(query, item.termo));
  if (matched.length === 0) {
    return [];
  }
  const byId = new Map(skills.map((skill) => [skill.id, skill]));
  const bySlug = new Map(skills.map((skill) => [skill.slug.toLowerCase(), skill]));
  const byNome = new Map(skills.map((skill) => [skill.nome.toLowerCase(), skill]));
  const found = new Map<string, Skill>();
  for (const syn of matched) {
    const alvo = syn.alvoId.toLowerCase();
    const skill = byId.get(syn.alvoId) ?? bySlug.get(alvo) ?? byNome.get(alvo);
    if (skill) {
      found.set(skill.id, skill);
    }
  }
  return [...found.values()];
};
