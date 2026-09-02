import type { ConsultaSemantica } from "../../../domain/entities/consulta-semantica.js";
import {
  colunaNomeQuantidade,
  metricaEhMedida,
  metricasMedidaSemDefinicao,
} from "../../../domain/entities/metrica-medida.js";
import type { Skill } from "../../../domain/entities/skill.js";
import { overlapCapacidade } from "./cobertura-skill.js";

export interface ConsultaSemanticaSugerida {
  readonly versao: 1;
  readonly metrica?: string;
  readonly dimensoes?: readonly string[];
  readonly colunaData?: string;
  readonly filtros?: readonly {
    readonly coluna: string;
    readonly op: "=";
    readonly param: string;
  }[];
  readonly modo?: "listagem";
}

export interface MetricaSemOverlay {
  readonly alias: string;
  readonly skillId: string;
  readonly nextAction: "atualizar_skill";
}

const HAYSTACK_QUANTIDADE = "quantidade volume qtd qtde parcelas";

const haystackKpi = (alias: string, definicao?: string, grao?: string): string =>
  `${alias} ${definicao ?? ""} ${grao ?? ""}`;

const perguntaFalaQuantidade = (query: string): boolean =>
  overlapCapacidade(query, HAYSTACK_QUANTIDADE) > 0;

const omitirAliasQuantidade = (alias: string, query: string): boolean =>
  colunaNomeQuantidade(alias) && !perguntaFalaQuantidade(query);

const deIr = (ir: ConsultaSemantica): ConsultaSemanticaSugerida => ({
  versao: 1,
  metrica: ir.metrica,
  ...(ir.dimensoes && ir.dimensoes.length > 0 ? { dimensoes: ir.dimensoes } : {}),
  ...(ir.periodo?.coluna ? { colunaData: ir.periodo.coluna } : {}),
});

interface CandidatoEsqueleto {
  readonly score: number;
  readonly fromIr: boolean;
  readonly hasDefinicao: boolean;
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
    if (a.hasDefinicao !== b.hasDefinicao) {
      return a.hasDefinicao ? -1 : 1;
    }
    return a.order - b.order;
  })[0];
};

const escolherEsqueleto = (
  candidatos: readonly CandidatoEsqueleto[],
): ConsultaSemanticaSugerida | undefined => {
  const vencedor = melhorCandidato(candidatos);
  if (!vencedor) {
    return undefined;
  }
  if (vencedor.score === 0 && !vencedor.fromIr) {
    return undefined;
  }
  return vencedor.esqueleto;
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
    if (metrica && metricaEhMedida(metrica) && !omitirAliasQuantidade(ir.metrica, query)) {
      candidatos.push({
        score: overlapCapacidade(query, haystackKpi(ir.metrica, metrica.definicao, metrica.grao)),
        fromIr: true,
        hasDefinicao: Boolean(metrica.definicao?.trim()),
        order: 0,
        esqueleto: deIr(ir),
      });
    }
  }
  skill.escopo.metricasSaida.forEach((item, index) => {
    if (!metricaEhMedida(item) || omitirAliasQuantidade(item.alias, query)) {
      return;
    }
    candidatos.push({
      score: overlapCapacidade(query, haystackKpi(item.alias, item.definicao, item.grao)),
      fromIr: false,
      hasDefinicao: Boolean(item.definicao?.trim()),
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
  return escolherEsqueleto(candidatos) ?? esqueletoListagem(skill);
};

const uniqueNomes = (nomes: readonly string[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const nome of nomes) {
    const trimmed = nome.trim();
    if (!trimmed) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(trimmed);
  }
  return out;
};

const esqueletoListagem = (skill: Skill): ConsultaSemanticaSugerida | undefined => {
  if (skill.escopo.metricasSaida.some(metricaEhMedida)) {
    return undefined;
  }
  const dimensoes = uniqueNomes([
    ...skill.escopo.graoResultado,
    ...Object.values(skill.escopo.graoPorTabela).flat(),
    ...(skill.escopo.metricasSaida[0]?.dimensoesPermitidas ?? []),
  ]);
  const filtros = skill.params.map((param) => ({
    coluna: param.nome,
    op: "=" as const,
    param: param.nome,
  }));
  if (dimensoes.length === 0 && filtros.length === 0) {
    return undefined;
  }
  return {
    versao: 1,
    modo: "listagem",
    ...(dimensoes.length > 0 ? { dimensoes } : {}),
    ...(filtros.length > 0 ? { filtros } : {}),
  };
};

export const metricasSemOverlayDasSkills = (skills: readonly Skill[]): MetricaSemOverlay[] => {
  const out: MetricaSemOverlay[] = [];
  const seen = new Set<string>();
  for (const skill of skills) {
    for (const metrica of metricasMedidaSemDefinicao(skill.escopo)) {
      const key = `${skill.id}:${metrica.alias.toLowerCase()}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      out.push({ alias: metrica.alias, skillId: skill.id, nextAction: "atualizar_skill" });
    }
  }
  return out;
};

export const esqueletoDaPrimeiraSkillComKpi = (
  skills: readonly Skill[],
  query = "",
): ConsultaSemanticaSugerida | undefined => {
  const candidatos: CandidatoEsqueleto[] = [];
  skills.forEach((skill, skillIndex) => {
    const esqueleto = esqueletoConsultaSemantica(skill, query);
    if (!esqueleto || esqueleto.modo === "listagem") {
      return;
    }
    const metricaAlias = esqueleto.metrica ?? "";
    const fromIr =
      skill.consultaSemantica !== null &&
      metricaAlias.length > 0 &&
      skill.consultaSemantica.metrica.toLowerCase() === metricaAlias.toLowerCase();
    const metrica = skill.escopo.metricasSaida.find(
      (item) => item.alias.toLowerCase() === metricaAlias.toLowerCase(),
    );
    candidatos.push({
      score: overlapCapacidade(query, haystackKpi(metricaAlias, metrica?.definicao, metrica?.grao)),
      fromIr,
      hasDefinicao: Boolean(metrica?.definicao?.trim()),
      order: skillIndex,
      esqueleto,
    });
  });
  const kpi = escolherEsqueleto(candidatos);
  if (kpi) {
    return kpi;
  }
  for (const skill of skills) {
    const listagem = esqueletoListagem(skill);
    if (listagem) {
      return listagem;
    }
  }
  return undefined;
};
