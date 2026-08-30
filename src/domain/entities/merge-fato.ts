import type { OrigemFato, StatusFato } from "./grafo.js";
import { origemRank } from "./grafo.js";
import type { PapelColuna } from "./escopo.js";
import { parseSensibilidadeColuna, type SensibilidadeColuna } from "./privacidade.js";

export interface FatoMerge {
  readonly origem: OrigemFato;
  readonly status: StatusFato;
  readonly descricao: string | null;
  readonly dicionario?: string | null;
  readonly tipo?: string | null;
  readonly formato?: string | null;
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

export const decidirMerge = (atual: FatoMerge, incoming: FatoMerge): MergeResultado => {
  const rankAtual = origemRank(atual.origem);
  const rankNovo = origemRank(incoming.origem);
  const tipo = tipoFisicoAposMerge(atual.tipo, incoming.tipo);
  const formato = formatoAposMerge(atual.formato, incoming.formato, tipo);
  if (rankNovo > rankAtual) {
    return { ...incoming, tipo, formato, status: "vigente", conflito: false, aplicar: true };
  }
  if (rankNovo < rankAtual) {
    if (tipo !== atual.tipo || formato !== atual.formato) {
      return {
        ...atual,
        tipo,
        formato,
        conflito: false,
        aplicar: true,
      };
    }
    return { ...atual, conflito: false, aplicar: false };
  }
  const conflito =
    conflitaTexto(atual.descricao, incoming.descricao) ||
    conflitaTexto(atual.dicionario, incoming.dicionario);
  if (conflito) {
    return { ...atual, tipo, formato, status: "conflito", conflito: true, aplicar: true };
  }
  return {
    origem: atual.origem,
    status: atual.status === "conflito" ? "conflito" : "vigente",
    descricao: atual.descricao ?? incoming.descricao,
    dicionario: atual.dicionario ?? incoming.dicionario,
    tipo,
    formato,
    conflito: false,
    aplicar: true,
  };
};

/** Enriquecimento (`validado_execucao`/`inferido`) não apaga classe confirmada pelo usuário. */
export const sensibilidadeAposMerge = (input: {
  readonly existenteOrigem: OrigemFato;
  readonly existenteSensibilidade: SensibilidadeColuna;
  readonly incomingOrigem: OrigemFato;
  readonly incomingSensibilidade?: SensibilidadeColuna | null;
}): SensibilidadeColuna => {
  const preservar =
    input.existenteOrigem === "confirmado_usuario" && input.incomingOrigem !== "confirmado_usuario";
  if (preservar) {
    return input.existenteSensibilidade;
  }
  if (input.incomingSensibilidade) {
    return parseSensibilidadeColuna(input.incomingSensibilidade);
  }
  return input.existenteSensibilidade;
};
