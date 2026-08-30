import type { ConsultaAprendida } from "../../../domain/entities/aprendizado.js";
import type { HitConhecimento } from "../../../domain/entities/conhecimento.js";
import {
  CONHECIMENTOS_TETO,
  tipoConhecimentoDeAnotacao,
  truncarTrechoConhecimento,
} from "../../../domain/entities/conhecimento.js";
import type { TabelaGrafo } from "../../../domain/entities/grafo.js";
import type { AnotacaoGrafo, Skill } from "../../../domain/entities/skill.js";
import { tokensCapacidade } from "./cobertura-skill.js";

const scoreHaystack = (haystack: string, terms: readonly string[]): number => {
  if (terms.length === 0) {
    return 0;
  }
  const hay = haystack.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  return terms.reduce((score, term) => score + (hay.includes(term) ? 1 : 0), 0);
};

export interface FiltroConhecimentos {
  readonly consultaPermitida: boolean;
  readonly skillIdsPermitidos: ReadonlySet<string>;
  readonly tabelasPermitidas: ReadonlySet<string>;
  readonly tabelaNomePorId: ReadonlyMap<string, string>;
}

const haystackSkill = (skill: Skill): string =>
  `${skill.nome} ${skill.descricao} ${skill.slug} ${skill.params
    .map((param) => `${param.nome} ${param.descricao}`)
    .join(" ")} ${skill.escopo.metricasSaida
    .map((item) => `${item.alias} ${item.definicao ?? ""} ${item.grao ?? ""}`)
    .join(" ")}`;

export const montarConhecimentos = (input: {
  readonly query: string;
  readonly skills: readonly Skill[];
  readonly anotacoes: readonly AnotacaoGrafo[];
  readonly consultas: readonly ConsultaAprendida[];
  readonly tabelas: readonly TabelaGrafo[];
  readonly filtro: FiltroConhecimentos;
}): HitConhecimento[] => {
  const terms = tokensCapacidade(input.query);
  const hits: HitConhecimento[] = [];

  for (const skill of input.skills) {
    if (input.filtro.consultaPermitida && !input.filtro.skillIdsPermitidos.has(skill.id)) {
      continue;
    }
    const score = scoreHaystack(haystackSkill(skill), terms);
    if (score <= 0) {
      continue;
    }
    hits.push({
      tipo: "skill",
      id: skill.id,
      titulo: skill.nome,
      trecho: truncarTrechoConhecimento(skill.descricao),
      fonte: "skill.descricao",
      skillId: skill.id,
      tabelaId: null,
      score,
    });
  }

  for (const nota of input.anotacoes) {
    if (!anotacaoPermitida(nota, input.filtro)) {
      continue;
    }
    const score = scoreHaystack(`${nota.titulo} ${nota.texto}`, terms);
    if (score <= 0) {
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
      score,
    });
  }

  for (const consulta of input.consultas) {
    const linked = consulta.skillIds.some((id) => input.filtro.skillIdsPermitidos.has(id));
    if (input.filtro.consultaPermitida && !linked) {
      continue;
    }
    const score = scoreHaystack(consulta.pergunta, terms);
    if (score <= 0) {
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
      score,
    });
  }

  for (const tabela of input.tabelas) {
    const nome = tabela.nome.toLowerCase();
    if (input.filtro.consultaPermitida && !input.filtro.tabelasPermitidas.has(nome)) {
      continue;
    }
    const score = scoreHaystack(`${tabela.nome} ${tabela.descricao ?? ""}`, terms);
    if (score <= 0) {
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
      score,
    });
  }

  hits.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return hits.slice(0, CONHECIMENTOS_TETO);
};

const anotacaoPermitida = (nota: AnotacaoGrafo, filtro: FiltroConhecimentos): boolean => {
  if (!filtro.consultaPermitida) {
    if (!nota.tabelaId) {
      return true;
    }
    const nome = filtro.tabelaNomePorId.get(nota.tabelaId);
    return nome ? filtro.tabelasPermitidas.has(nome.toLowerCase()) : true;
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

export const hintRegraParcial = (
  cobertura: "completa" | "parcial" | "desconhecida",
  conhecimentos: readonly HitConhecimento[],
): string | undefined => {
  if (cobertura === "completa") {
    return undefined;
  }
  const regra = conhecimentos.find((item) => item.tipo === "regra" && item.skillId);
  if (!regra) {
    return undefined;
  }
  return `Há regra na skill ligada a esta pergunta. Leia obter_skill e validar_consulta. Match textual isolado não autoriza consultar_dados — registre sinônimo se o usuário confirmar o termo.`;
};
