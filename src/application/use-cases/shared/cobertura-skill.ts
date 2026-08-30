import type { Skill } from "../../../domain/entities/skill.js";
import type { Sinonimo } from "../../../domain/entities/aprendizado.js";
import { STOPWORDS_BUSCA } from "../../../domain/entities/stopwords-busca.js";

const stripAccents = (value: string): string =>
  value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export const tokensCapacidade = (query: string): readonly string[] => {
  const unique = [
    ...new Set(
      stripAccents(query)
        .split(/[^a-z0-9]+/)
        .filter((term) => term.length >= 3 && !STOPWORDS_BUSCA.has(term)),
    ),
  ];
  return unique;
};

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
  const params = skill.params.map((param) => `${param.nome} ${param.descricao} ${param.tipo}`);
  const metricas = skill.escopo.metricasSaida.map(
    (item) => `${item.alias} ${item.definicao ?? ""} ${item.grao ?? ""}`,
  );
  return stripAccents(
    `${skill.nome} ${skill.descricao} ${skill.slug} ${params.join(" ")} ${metricas.join(" ")} ${synTermos.join(" ")}`,
  );
};

export const coberturaDeSkill = (
  skill: Skill,
  query: string,
  sinonimos: readonly Sinonimo[] = [],
): {
  cobertura: "completa" | "parcial" | "desconhecida";
  termosEncontrados: string[];
} => {
  const tokens = tokensCapacidade(query);
  const text = haystackCertificado(skill, sinonimos);
  const termosEncontrados = tokens.filter((token) => text.includes(token));
  const cobertura: "completa" | "parcial" | "desconhecida" =
    tokens.length === 0
      ? "desconhecida"
      : termosEncontrados.length === tokens.length
        ? "completa"
        : termosEncontrados.length > 0
          ? "parcial"
          : "desconhecida";
  return { cobertura, termosEncontrados };
};
