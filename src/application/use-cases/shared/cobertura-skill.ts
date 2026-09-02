import type { Skill } from "../../../domain/entities/skill.js";
import type { Sinonimo } from "../../../domain/entities/aprendizado.js";
import { STOPWORDS_CAPACIDADE } from "../../../domain/entities/stopwords-busca.js";
import { stripComplementoNegado } from "../../../domain/entities/negacao-cobertura.js";
import { scoreStemOverlap, stemsDeTexto } from "../../../domain/entities/stem-portugues.js";

const ANO_CALENDARIO = /^\d{4}$/;

export type CoberturaNivel = "completa" | "parcial" | "desconhecida" | "composta";

export const tokensCapacidade = (
  query: string,
  extraStop: ReadonlySet<string> = new Set(),
): readonly string[] => {
  const stop = new Set([...STOPWORDS_CAPACIDADE, ...extraStop]);
  return stemsDeTexto(query, stop).filter((token) => !ANO_CALENDARIO.test(token));
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
  const params = skill.params.map((param) => `${param.nome} ${param.descricao}`);
  const metricas = skill.escopo.metricasSaida.map(
    (item) => `${item.alias} ${item.definicao ?? ""} ${item.grao ?? ""}`,
  );
  const descricao = stripComplementoNegado(skill.descricao);
  return `${skill.nome} ${descricao} ${skill.slug} ${params.join(" ")} ${metricas.join(" ")} ${synTermos.join(" ")}`;
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
  const hay = new Set(stemsDeTexto(haystackCertificado(skill, sinonimos), STOPWORDS_CAPACIDADE));
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
  scoreStemOverlap(haystack, tokensCapacidade(query), STOPWORDS_CAPACIDADE);

export interface FatiaContexto {
  readonly skillId: string;
  readonly slug: string;
  readonly nome: string;
  readonly cobertura: "completa" | "parcial" | "desconhecida";
  readonly consultaPermitida: boolean;
  readonly termosEncontrados: string[];
  readonly termosAusentes: string[];
  readonly consultasAprendidas: readonly string[];
}

export interface ComposicaoCobertura {
  readonly cobertura: CoberturaNivel;
  readonly consultaPermitida: boolean;
  readonly fatias: readonly FatiaContexto[];
  readonly termosSemSkill: readonly string[];
}

export const comporFatiasBusca = (
  skills: readonly Skill[],
  query: string,
  sinonimos: readonly Sinonimo[] = [],
  consultasPorSkill: ReadonlyMap<string, readonly string[]> = new Map(),
): ComposicaoCobertura => {
  const tokens = tokensCapacidade(query);
  const candidatos = skills.map((skill) => {
    const cob = coberturaDeSkill(skill, query, sinonimos);
    return {
      skillId: skill.id,
      slug: skill.slug,
      nome: skill.nome,
      cobertura: cob.cobertura,
      consultaPermitida: cob.termosEncontrados.length > 0,
      termosEncontrados: cob.termosEncontrados,
      termosAusentes: cob.termosAusentes,
      consultasAprendidas: [...(consultasPorSkill.get(skill.id) ?? [])],
    };
  });
  const cobertos = new Set(candidatos.flatMap((item) => item.termosEncontrados));
  const termosSemSkill = tokens.filter((token) => !cobertos.has(token));
  const fatias = candidatos.filter((item) => item.consultaPermitida);
  const algumaCompleta = candidatos.some((item) => item.cobertura === "completa");
  if (algumaCompleta) {
    return {
      cobertura: "completa",
      consultaPermitida: true,
      fatias,
      termosSemSkill,
    };
  }
  if (fatias.length >= 2) {
    return {
      cobertura: "composta",
      consultaPermitida: true,
      fatias,
      termosSemSkill,
    };
  }
  const algumaParcial = candidatos.some((item) => item.cobertura === "parcial");
  return {
    cobertura: algumaParcial ? "parcial" : "desconhecida",
    consultaPermitida: false,
    fatias,
    termosSemSkill,
  };
};
