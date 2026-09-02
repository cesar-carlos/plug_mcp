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
import { STOPWORDS_CONSULTA_APRENDIDA } from "../../../domain/entities/consulta-aprendida-generica.js";
import { STOPWORDS_BUSCA } from "../../../domain/entities/stopwords-busca.js";
import { scoreStemOverlap } from "../../../domain/entities/stem-portugues.js";
import { haystackCertificado, tokensCapacidade } from "./cobertura-skill.js";

const tokensConteudoConsulta = (query: string): readonly string[] =>
  tokensCapacidade(query, STOPWORDS_CONSULTA_APRENDIDA);

export const consultaAprendidaRelevante = (query: string, pergunta: string): boolean =>
  scoreHaystack(pergunta, tokensConteudoConsulta(query)) > 0;

const scoreHaystack = (haystack: string, stemmedTerms: readonly string[]): number =>
  scoreStemOverlap(haystack, stemmedTerms, STOPWORDS_BUSCA);

const scoreComPiso = (
  haystack: string,
  stemmedTerms: readonly string[],
  recuperada: boolean,
): number | undefined => {
  const overlap = scoreHaystack(haystack, stemmedTerms);
  if (!recuperada && overlap <= 0) {
    return undefined;
  }
  return recuperada ? Math.max(overlap, 1) : overlap;
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
  readonly anotacaoIdsRecuperados?: ReadonlySet<string>;
  readonly tabelaIdsRecuperados?: ReadonlySet<string>;
  readonly sinonimos?: readonly Sinonimo[];
  readonly ranksPorId?: ReadonlyMap<string, number>;
}): HitConhecimento[] => {
  const terms = tokensCapacidade(input.query);
  const sinonimos = input.sinonimos ?? [];
  const ranksPorId = input.ranksPorId ?? new Map<string, number>();
  const anotacaoIdsRecuperados = input.anotacaoIdsRecuperados ?? new Set<string>();
  const tabelaIdsRecuperados = input.tabelaIdsRecuperados ?? new Set<string>();
  const hits: HitConhecimento[] = [];

  for (const skill of input.skills) {
    if (input.filtro.consultaPermitida && !input.filtro.skillIdsPermitidos.has(skill.id)) {
      continue;
    }
    const base = scoreComPiso(
      haystackCertificado(skill, sinonimos),
      terms,
      input.skillIdsRecuperados.has(skill.id),
    );
    if (base === undefined) {
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
      score: scoreComRank(base, skill.id, ranksPorId),
    });
  }

  for (const nota of input.anotacoes) {
    if (!anotacaoPermitida(nota, input.filtro)) {
      continue;
    }
    const base = scoreComPiso(
      `${nota.titulo} ${nota.texto}`,
      terms,
      anotacaoIdsRecuperados.has(nota.id),
    );
    if (base === undefined) {
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
      score: scoreComRank(base, nota.id, ranksPorId),
    });
  }

  const termsConsulta = tokensConteudoConsulta(input.query);
  for (const consulta of input.consultas) {
    const linked = consulta.skillIds.some((id) => input.filtro.skillIdsPermitidos.has(id));
    if (input.filtro.consultaPermitida && !linked) {
      continue;
    }
    const score = scoreHaystack(consulta.pergunta, termsConsulta);
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
      score: scoreComRank(score, consulta.id, ranksPorId),
    });
  }

  for (const tabela of input.tabelas) {
    const nome = tabela.nome.toLowerCase();
    if (input.filtro.consultaPermitida && !input.filtro.tabelasPermitidas.has(nome)) {
      continue;
    }
    const base = scoreComPiso(
      `${tabela.nome} ${tabela.descricao ?? ""}`,
      terms,
      tabelaIdsRecuperados.has(tabela.id),
    );
    if (base === undefined) {
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
      score: scoreComRank(base, tabela.id, ranksPorId),
    });
  }

  return reservarSlotNarrativa(hits);
};

export const HINT_SKILL_GAP_CRUZAMENTO =
  "Não cruze skills sem relacionamento publicado no pacote. confirmar_relacionamento só se o usuário pedir. Não registre sinônimo por este gap.";

const CRUZAMENTO_RE = /\bcruzar\b|\bcruzamento\b|\bjuntas\b|única consulta|unica consulta/i;

export const perguntaPareceCruzamento = (query: string): boolean => CRUZAMENTO_RE.test(query);

export const hintRegraParcial = (
  cobertura: "completa" | "parcial" | "desconhecida" | "composta",
  conhecimentos: readonly HitConhecimento[],
  temCandidatos = false,
  termosAusentes: readonly string[] = [],
  query = "",
  omitirSinonimo = false,
): string | undefined => {
  if (!temCandidatos || cobertura === "completa" || cobertura === "composta") {
    return undefined;
  }
  const narrativa = conhecimentos.find(isNarrativaComSkill);
  if (cobertura === "parcial") {
    const prefixo = narrativa
      ? "Há regra na skill ligada a esta pergunta. Leia obter_skill e validar_consulta."
      : "Cobertura parcial. Leia obter_skill e validar_consulta.";
    const ausentes =
      termosAusentes.length > 0
        ? ` Termos ausentes no pacote: ${termosAusentes.slice(0, 3).join(", ")}.`
        : "";
    const fecho = omitirSinonimo
      ? " Match textual isolado não autoriza consultar_dados. Não registre sinônimo — o termo ausente veio de domínio sem skill ou de negação na descrição. Oriente treinar_com_sql se faltar skill capaz."
      : " Match textual isolado não autoriza consultar_dados — registre sinônimo (registrar_aprendizado tipo=sinonimo) se o usuário confirmar o termo.";
    return `${prefixo}${ausentes}${fecho}`;
  }
  if (!narrativa) {
    return undefined;
  }
  const cruzamento = perguntaPareceCruzamento(query) ? ` ${HINT_SKILL_GAP_CRUZAMENTO}` : "";
  return `Há regra na skill ligada a esta pergunta. Leia obter_skill e validar_consulta.${cruzamento}`;
};
