import type { OrigemFato, StatusFato } from "./grafo.js";
import { origemRank } from "./grafo.js";
import type { PapelColuna, PerfilColuna } from "./escopo.js";
import { parseSensibilidadeColuna, type SensibilidadeColuna } from "./privacidade.js";

export interface FatoMerge {
  readonly origem: OrigemFato;
  readonly status: StatusFato;
  readonly descricao: string | null;
  readonly dicionario?: string | null;
  readonly tipo?: string | null;
  readonly formato?: string | null;
  readonly tipoJoin?: string;
}

export interface MergeResultado extends FatoMerge {
  readonly conflito: boolean;
  readonly aplicar: boolean;
}

const norm = (value: string | null | undefined): string => (value ?? "").trim().toLowerCase();

export type FamiliaTipoFisico = "uuid" | "temporal" | "numerico" | "texto" | "binario" | "outro";

export const familiaTipoFisico = (tipo: string | null | undefined): FamiliaTipoFisico | null => {
  const t = norm(tipo);
  if (!t) {
    return null;
  }
  if (t.includes("uniqueidentifier") || t.includes("uuid") || t.includes("guid")) {
    return "uuid";
  }
  if (
    t.includes("date") ||
    t.includes("time") ||
    t.includes("timestamp") ||
    t.includes("interval")
  ) {
    return "temporal";
  }
  if (
    t.includes("numeric") ||
    t.includes("decimal") ||
    t.includes("money") ||
    t.includes("int") ||
    t.includes("float") ||
    t.includes("real") ||
    t.includes("double") ||
    t.includes("number") ||
    t.includes("serial")
  ) {
    return "numerico";
  }
  if (
    t.includes("char") ||
    t.includes("text") ||
    t.includes("clob") ||
    t.includes("xml") ||
    t.includes("json") ||
    t.includes("string")
  ) {
    return "texto";
  }
  if (t.includes("binary") || t.includes("blob") || t.includes("image") || t.includes("bytea")) {
    return "binario";
  }
  return "outro";
};

export const tiposFisicosIncompativeis = (
  atual: string | null | undefined,
  incoming: string | null | undefined,
): boolean => {
  const fa = familiaTipoFisico(atual);
  const fb = familiaTipoFisico(incoming);
  return fa !== null && fb !== null && fa !== fb;
};

export const tipoCompativelComPapel = (
  tipo: string | null | undefined,
  papel: PapelColuna | null | undefined,
): boolean => {
  if (papel !== "data") {
    return true;
  }
  const familia = familiaTipoFisico(tipo);
  return familia === null || familia === "temporal";
};

const tipoFisicoAposMerge = (
  atual: string | null | undefined,
  incoming: string | null | undefined,
): string | null | undefined => {
  if (!incoming) {
    return atual;
  }
  if (!atual) {
    return incoming;
  }
  if (tiposFisicosIncompativeis(atual, incoming) || norm(atual) !== norm(incoming)) {
    return incoming;
  }
  return atual;
};

const formatoAposMerge = (
  atual: string | null | undefined,
  incoming: string | null | undefined,
  tipoEscolhido: string | null | undefined,
): string | null | undefined => {
  if (incoming) {
    return incoming;
  }
  if (tiposFisicosIncompativeis(atual, tipoEscolhido)) {
    return incoming ?? null;
  }
  return atual ?? incoming;
};

const conflitaTexto = (
  atual: string | null | undefined,
  incoming: string | null | undefined,
): boolean => {
  const a = norm(atual);
  const b = norm(incoming);
  return a.length > 0 && b.length > 0 && a !== b;
};

const tipoJoinAposMerge = (
  atual: string | undefined,
  incoming: string | undefined,
  rankAtual: number,
  rankNovo: number,
): string | undefined => {
  if (rankNovo < rankAtual) {
    return atual ?? incoming;
  }
  return incoming ?? atual;
};

export const decidirMerge = (atual: FatoMerge, incoming: FatoMerge): MergeResultado => {
  const rankAtual = origemRank(atual.origem);
  const rankNovo = origemRank(incoming.origem);
  const tipo = tipoFisicoAposMerge(atual.tipo, incoming.tipo);
  const formato = formatoAposMerge(atual.formato, incoming.formato, tipo);
  const tipoJoin = tipoJoinAposMerge(atual.tipoJoin, incoming.tipoJoin, rankAtual, rankNovo);
  if (rankNovo > rankAtual) {
    return {
      ...incoming,
      tipo,
      formato,
      tipoJoin,
      status: "vigente",
      conflito: false,
      aplicar: true,
    };
  }
  if (rankNovo < rankAtual) {
    if (tipo !== atual.tipo || formato !== atual.formato) {
      return {
        ...atual,
        tipo,
        formato,
        tipoJoin,
        conflito: false,
        aplicar: true,
      };
    }
    return { ...atual, tipoJoin, conflito: false, aplicar: false };
  }
  const conflito =
    conflitaTexto(atual.descricao, incoming.descricao) ||
    conflitaTexto(atual.dicionario, incoming.dicionario);
  if (conflito) {
    return { ...atual, tipo, formato, tipoJoin, status: "conflito", conflito: true, aplicar: true };
  }
  return {
    origem: atual.origem,
    status: atual.status === "conflito" ? "conflito" : "vigente",
    descricao: atual.descricao ?? incoming.descricao,
    dicionario: atual.dicionario ?? incoming.dicionario,
    tipo,
    formato,
    tipoJoin,
    conflito: false,
    aplicar: true,
  };
};

/**
 * Só `confirmado_usuario` altera a classe. Perfil/`validado_execucao`/`inferido` preenchem
 * tipo/formato/min/max e não reescrevem privacidade — mesmo depois da origem virar
 * `validado_execucao` (segundo merge no `enriquecer=completo`).
 * O inverso também vale: confirmação do dono aplica a classe mesmo se o rank atual
 * for `validado_execucao` (`confirmar_coluna` não é no-op silencioso).
 */
export const sensibilidadeAposMerge = (input: {
  readonly existenteOrigem: OrigemFato;
  readonly existenteSensibilidade: SensibilidadeColuna;
  readonly incomingOrigem: OrigemFato;
  readonly incomingSensibilidade?: SensibilidadeColuna | null;
}): SensibilidadeColuna => {
  if (input.incomingOrigem === "confirmado_usuario" && input.incomingSensibilidade) {
    return parseSensibilidadeColuna(input.incomingSensibilidade);
  }
  return input.existenteSensibilidade;
};

export const confirmacaoSensibilidadeVenceRank = (
  incomingOrigem: OrigemFato,
  incomingSensibilidade?: SensibilidadeColuna | null,
): boolean => incomingOrigem === "confirmado_usuario" && incomingSensibilidade != null;

export interface SnapshotColunaMerge {
  readonly origem: OrigemFato;
  readonly status: StatusFato;
  readonly descricao: string | null;
  readonly dicionario: string | null;
  readonly tipo: string | null;
  readonly formato: string | null;
  readonly nullable: boolean | null;
  readonly papel: PapelColuna | null;
  readonly perfil: PerfilColuna | null;
  readonly sensibilidade: SensibilidadeColuna;
}

export interface IncomingColunaMerge {
  readonly origem: OrigemFato;
  readonly descricao?: string | null;
  readonly dicionario?: string | null;
  readonly tipo?: string | null;
  readonly formato?: string | null;
  readonly nullable?: boolean | null;
  readonly papel?: PapelColuna | null;
  readonly perfil?: PerfilColuna | null;
  readonly sensibilidade?: SensibilidadeColuna | null;
}

/**
 * Privacidade é exceção ao rank: `confirmado_usuario` + classe aplica mesmo quando
 * `decidirMerge.aplicar` é false (`validado_execucao` não bloqueia `confirmar_coluna`).
 */
export const mergeCamposColuna = (
  existing: SnapshotColunaMerge,
  incoming: IncomingColunaMerge,
): { campos: SnapshotColunaMerge; conflito: boolean } | null => {
  const merge = decidirMerge(
    {
      origem: existing.origem,
      status: existing.status,
      descricao: existing.descricao,
      dicionario: existing.dicionario,
      tipo: existing.tipo,
      formato: existing.formato,
    },
    {
      origem: incoming.origem,
      status: "vigente",
      descricao: incoming.descricao ?? null,
      dicionario: incoming.dicionario ?? null,
      tipo: incoming.tipo ?? null,
      formato: incoming.formato ?? null,
    },
  );
  const confirmaClasse = confirmacaoSensibilidadeVenceRank(incoming.origem, incoming.sensibilidade);
  if (!merge.aplicar && !confirmaClasse) {
    return null;
  }
  return {
    campos: {
      tipo: merge.tipo ?? existing.tipo,
      formato: merge.formato ?? existing.formato,
      descricao: merge.descricao,
      dicionario: merge.dicionario ?? existing.dicionario,
      nullable: incoming.nullable ?? existing.nullable,
      papel: incoming.papel ?? existing.papel,
      perfil: incoming.perfil ?? existing.perfil,
      sensibilidade: sensibilidadeAposMerge({
        existenteOrigem: existing.origem,
        existenteSensibilidade: existing.sensibilidade,
        incomingOrigem: incoming.origem,
        incomingSensibilidade: incoming.sensibilidade,
      }),
      origem: confirmaClasse ? "confirmado_usuario" : merge.origem,
      status: merge.aplicar ? merge.status : existing.status,
    },
    conflito: merge.conflito,
  };
};
