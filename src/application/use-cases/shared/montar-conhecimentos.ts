import type { ConsultaAprendida, Sinonimo } from "../../../domain/entities/aprendizado.js";
import type { HitConhecimento } from "../../../domain/entities/conhecimento.js";
import {
  CONHECIMENTOS_TETO,
  TIPOS_NARRATIVA_COM_SKILL,
  tipoConhecimentoDeAnotacao,
  truncarTrechoConhecimento,
} from "../../../domain/entities/conhecimento.js";
import { clampRankFts } from "../../../domain/entities/hit-busca.js";
import type { TabelaGrafo } from "../../../domain/entities/grafo.js";
import type { AnotacaoGrafo, Skill } from "../../../domain/entities/skill.js";
import { haystackCertificado, tokensCapacidade } from "./cobertura-skill.js";

const scoreHaystack = (haystack: string, terms: readonly string[]): number => {
  if (terms.length === 0) {
    return 0;
  }
  const hay = haystack.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  return terms.reduce((score, term) => score + (hay.includes(term) ? 1 : 0), 0);
};

const scoreComRank = (base: number, id: string, ranksPorId: ReadonlyMap<string, number>): number =>
  base + clampRankFts(ranksPorId.get(id) ?? 0);

const isNarrativaComSkill = (item: HitConhecimento): boolean =>
  TIPOS_NARRATIVA_COM_SKILL.has(item.tipo) && Boolean(item.skillId);

export interface FiltroConhecimentos {
  readonly consultaPermitida: boolean;
  readonly skillIdsPermitidos: ReadonlySet<string>;
  readonly skillIdsCandidatos: ReadonlySet<string>;
  readonly tabelasPermitidas: ReadonlySet<string>;
  readonly tabelaNomePorId: ReadonlyMap<string, string>;
}

export const anotacaoPermitida = (nota: AnotacaoGrafo, filtro: FiltroConhecimentos): boolean => {
  if (!filtro.consultaPermitida) {
    if (!nota.tabelaId) {
      if (!nota.skillId) {
        return true;
      }
      return filtro.skillIdsCandidatos.has(nota.skillId);
    }
    const nome = filtro.tabelaNomePorId.get(nota.tabelaId);
    if (!nome) {
      return false;
    }
    return filtro.tabelasPermitidas.has(nome.toLowerCase());
  }
  if (nota.skillId && filtro.skillIdsPermitidos.has(nota.skillId)) {
    return true;
  }
  if (nota.tabelaId) {
    const nome = filtro.tabelaNomePorId.get(nota.tabelaId);
    return nome ? filtro.tabelasPermitidas.has(nome.toLowerCase()) : false;
  }
  return false;
};

export const filtrarAnotacoes = (
  notas: readonly AnotacaoGrafo[],
  filtro: FiltroConhecimentos,
): AnotacaoGrafo[] => notas.filter((nota) => anotacaoPermitida(nota, filtro));

const reservarSlotNarrativa = (hits: readonly HitConhecimento[]): HitConhecimento[] => {
  const sorted = [...hits].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  if (sorted.length <= CONHECIMENTOS_TETO) {
    return sorted;
  }
  const top = sorted.slice(0, CONHECIMENTOS_TETO);
  if (top.some(isNarrativaComSkill)) {
    return top;
  }
  const narrativa = sorted.find(isNarrativaComSkill);
  if (!narrativa) {
    return top;
  }
  return [...top.slice(0, CONHECIMENTOS_TETO - 1), narrativa].sort(
    (a, b) => b.score - a.score || a.id.localeCompare(b.id),
  );
};

export const montarConhecimentos = (input: {
  readonly query: string;
  readonly skills: readonly Skill[];
  readonly anotacoes: readonly AnotacaoGrafo[];
  readonly consultas: readonly ConsultaAprendida[];
  readonly tabelas: readonly TabelaGrafo[];
  readonly filtro: FiltroConhecimentos;
  readonly skillIdsRecuperados: ReadonlySet<string>;
  readonly sinonimos?: readonly Sinonimo[];
  readonly ranksPorId?: ReadonlyMap<string, number>;
}): HitConhecimento[] => {
  const terms = tokensCapacidade(input.query);
  const sinonimos = input.sinonimos ?? [];
  const ranksPorId = input.ranksPorId ?? new Map<string, number>();
  const hits: HitConhecimento[] = [];

  for (const skill of input.skills) {
    if (input.filtro.consultaPermitida && !input.filtro.skillIdsPermitidos.has(skill.id)) {
      continue;
    }
    const substring = scoreHaystack(haystackCertificado(skill, sinonimos), terms);
    const recuperada = input.skillIdsRecuperados.has(skill.id);
    if (!recuperada && substring <= 0) {
      continue;
    }
    const base = recuperada ? Math.max(substring, 1) : substring;
    hits.push({
      tipo: "skill",
      id: skill.id,
      titulo: skill.nome,
      trecho: truncarTrechoConhecimento(skill.descricao),
      fonte: "skill.descricao",
      skillId: skill.id,
      tabelaId: null,
      score: scoreComRank(base, skill.id, ranksPorId),
    });
  }

  for (const nota of input.anotacoes) {
    if (!anotacaoPermitida(nota, input.filtro)) {
      continue;
    }
    hits.push({
      tipo: tipoConhecimentoDeAnotacao(nota.tipo),
      id: nota.id,
      titulo: nota.titulo,
      trecho: truncarTrechoConhecimento(nota.texto),
      fonte: "anotacao_grafo",
      skillId: nota.skillId,
      tabelaId: nota.tabelaId,
      score: scoreComRank(
        Math.max(scoreHaystack(`${nota.titulo} ${nota.texto}`, terms), 1),
        nota.id,
        ranksPorId,
      ),
    });
  }

  for (const consulta of input.consultas) {
    const linked = consulta.skillIds.some((id) => input.filtro.skillIdsPermitidos.has(id));
    if (input.filtro.consultaPermitida && !linked) {
      continue;
    }
    hits.push({
      tipo: "consulta_aprendida",
      id: consulta.id,
      titulo: consulta.pergunta,
      trecho: truncarTrechoConhecimento(consulta.pergunta),
      fonte: "consulta_aprendida.pergunta",
      skillId: consulta.skillIds[0] ?? null,
      tabelaId: null,
      score: scoreComRank(
        Math.max(scoreHaystack(consulta.pergunta, terms), 1),
        consulta.id,
        ranksPorId,
      ),
    });
  }

  for (const tabela of input.tabelas) {
    const nome = tabela.nome.toLowerCase();
    if (input.filtro.consultaPermitida && !input.filtro.tabelasPermitidas.has(nome)) {
      continue;
    }
    hits.push({
      tipo: "tabela",
      id: tabela.id,
      titulo: tabela.nome,
      trecho: truncarTrechoConhecimento(tabela.descricao ?? tabela.nome),
      fonte: "tabela_grafo",
      skillId: null,
      tabelaId: tabela.id,
      score: scoreComRank(
        Math.max(scoreHaystack(`${tabela.nome} ${tabela.descricao ?? ""}`, terms), 1),
        tabela.id,
        ranksPorId,
      ),
    });
  }

  return reservarSlotNarrativa(hits);
};

export const hintRegraParcial = (
  cobertura: "completa" | "parcial" | "desconhecida",
  conhecimentos: readonly HitConhecimento[],
  temCandidatos = false,
): string | undefined => {
  if (!temCandidatos || cobertura === "completa") {
    return undefined;
  }
  const narrativa = conhecimentos.find(isNarrativaComSkill);
  if (cobertura !== "parcial" && !narrativa) {
    return undefined;
  }
  const prefixo = narrativa
    ? "Há regra na skill ligada a esta pergunta. Leia obter_skill e validar_consulta."
    : "Cobertura parcial. Leia obter_skill e validar_consulta.";
  return `${prefixo} Match textual isolado não autoriza consultar_dados — registre sinônimo (registrar_aprendizado tipo=sinonimo) se o usuário confirmar o termo.`;
};
