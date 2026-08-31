import type { Skill } from "../../../domain/entities/skill.js";
import type { Sinonimo } from "../../../domain/entities/aprendizado.js";
import { STOPWORDS_BUSCA } from "../../../domain/entities/stopwords-busca.js";
import { scoreStemOverlap, stemsDeTexto } from "../../../domain/entities/stem-portugues.js";

export const tokensCapacidade = (
  query: string,
  extraStop: ReadonlySet<string> = new Set(),
): readonly string[] => stemsDeTexto(query, new Set([...STOPWORDS_BUSCA, ...extraStop]));

export const haystackCertificado = (skill: Skill, sinonimos: readonly Sinonimo[] = []): string => {
  const synTermos = sinonimos
    .filter((item) => {
      const alvo = item.alvoId.toLowerCase();
      return (
        item.alvoId === skill.id ||
        alvo === skill.slug.toLowerCase() ||
        skill.nome.toLowerCase().includes(alvo)
      );
    })
    .map((item) => item.termo);
  const params = skill.params.map((param) => `${param.nome} ${param.descricao}`);
  const metricas = skill.escopo.metricasSaida.map(
    (item) => `${item.alias} ${item.definicao ?? ""} ${item.grao ?? ""}`,
  );
  return `${skill.nome} ${skill.descricao} ${skill.slug} ${params.join(" ")} ${metricas.join(" ")} ${synTermos.join(" ")}`;
};

export interface CoberturaSkill {
  readonly cobertura: "completa" | "parcial" | "desconhecida";
  readonly termosEncontrados: string[];
  readonly termosAusentes: string[];
}

export const coberturaDeSkill = (
  skill: Skill,
  query: string,
  sinonimos: readonly Sinonimo[] = [],
): CoberturaSkill => {
  const tokens = tokensCapacidade(query);
  const hay = new Set(stemsDeTexto(haystackCertificado(skill, sinonimos), STOPWORDS_BUSCA));
  const termosEncontrados = tokens.filter((token) => hay.has(token));
  const termosAusentes = tokens.filter((token) => !hay.has(token));
  const cobertura: CoberturaSkill["cobertura"] =
    tokens.length === 0
      ? "desconhecida"
      : termosAusentes.length === 0
        ? "completa"
        : termosEncontrados.length > 0
          ? "parcial"
          : "desconhecida";
  return { cobertura, termosEncontrados, termosAusentes };
};

export const overlapCapacidade = (query: string, haystack: string): number =>
  scoreStemOverlap(haystack, tokensCapacidade(query), STOPWORDS_BUSCA);
