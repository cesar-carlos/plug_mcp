import type { ConsultaSemantica } from "../../../domain/entities/consulta-semantica.js";
import type { Skill } from "../../../domain/entities/skill.js";
import { tokensCapacidade } from "./cobertura-skill.js";

export interface ConsultaSemanticaSugerida {
  readonly versao: 1;
  readonly metrica: string;
  readonly dimensoes?: readonly string[];
  readonly colunaData?: string;
}

const stripAccents = (value: string): string =>
  value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

const overlapTokens = (query: string, haystack: string): number => {
  const tokens = tokensCapacidade(query);
  if (tokens.length === 0) {
    return 0;
  }
  const text = stripAccents(haystack);
  return tokens.filter((token) => text.includes(token)).length;
};

const haystackKpi = (alias: string, definicao?: string, grao?: string): string =>
  `${alias} ${definicao ?? ""} ${grao ?? ""}`;

const deIr = (ir: ConsultaSemantica): ConsultaSemanticaSugerida => ({
  versao: 1,
  metrica: ir.metrica,
  ...(ir.dimensoes && ir.dimensoes.length > 0 ? { dimensoes: ir.dimensoes } : {}),
  ...(ir.periodo?.coluna ? { colunaData: ir.periodo.coluna } : {}),
});

interface CandidatoEsqueleto {
  readonly score: number;
  readonly fromIr: boolean;
  readonly order: number;
  readonly esqueleto: ConsultaSemanticaSugerida;
}

const melhorCandidato = (
  candidatos: readonly CandidatoEsqueleto[],
): CandidatoEsqueleto | undefined => {
  if (candidatos.length === 0) {
    return undefined;
  }
  return [...candidatos].sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    if (a.fromIr !== b.fromIr) {
      return a.fromIr ? -1 : 1;
    }
    return a.order - b.order;
  })[0];
};

export const esqueletoConsultaSemantica = (
  skill: Skill,
  query = "",
): ConsultaSemanticaSugerida | undefined => {
  const candidatos: CandidatoEsqueleto[] = [];
  if (skill.consultaSemantica) {
    const ir = skill.consultaSemantica;
    const metrica = skill.escopo.metricasSaida.find(
      (item) => item.alias.toLowerCase() === ir.metrica.toLowerCase(),
    );
    candidatos.push({
      score: overlapTokens(query, haystackKpi(ir.metrica, metrica?.definicao, metrica?.grao)),
      fromIr: true,
      order: 0,
      esqueleto: deIr(ir),
    });
  }
  skill.escopo.metricasSaida.forEach((item, index) => {
    candidatos.push({
      score: overlapTokens(query, haystackKpi(item.alias, item.definicao, item.grao)),
      fromIr: false,
      order: index + 1,
      esqueleto: {
        versao: 1,
        metrica: item.alias,
        ...(item.dimensoesPermitidas && item.dimensoesPermitidas.length > 0
          ? { dimensoes: item.dimensoesPermitidas }
          : {}),
        ...(item.colunaData ? { colunaData: item.colunaData } : {}),
      },
    });
  });
  return melhorCandidato(candidatos)?.esqueleto;
};

export const esqueletoDaPrimeiraSkillComKpi = (
  skills: readonly Skill[],
  query = "",
): ConsultaSemanticaSugerida | undefined => {
  const candidatos: CandidatoEsqueleto[] = [];
  skills.forEach((skill, skillIndex) => {
    const esqueleto = esqueletoConsultaSemantica(skill, query);
    if (!esqueleto) {
      return;
    }
    const fromIr =
      skill.consultaSemantica !== null &&
      skill.consultaSemantica.metrica.toLowerCase() === esqueleto.metrica.toLowerCase();
    const metrica = skill.escopo.metricasSaida.find(
      (item) => item.alias.toLowerCase() === esqueleto.metrica.toLowerCase(),
    );
    candidatos.push({
      score: overlapTokens(
        query,
        haystackKpi(esqueleto.metrica, metrica?.definicao, metrica?.grao),
      ),
      fromIr,
      order: skillIndex,
      esqueleto,
    });
  });
  return melhorCandidato(candidatos)?.esqueleto;
};
